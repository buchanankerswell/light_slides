# Top-level dirs
PROJECT_ROOT := $(CURDIR)
PIPELINE := $(PROJECT_ROOT)/pipeline
SITE := $(PROJECT_ROOT)/docs
RAW := $(PIPELINE)/raw
CUES := $(PIPELINE)/cues

# Conda config
CONDA_ENV_ID := light-slides
CONDA_ENV_YML := environment.yml
CONDA_PYTHON = $$(conda run -n $(CONDA_ENV_ID) which python)

# Whisper + serving + media release
WHISPER_MODEL := small
SERVE_PORT := 8811
LOCAL_PORT := 8812
LOCAL_TEST_DIR := /tmp/ls-local-test
# Media host: Cloudflare R2 public bucket (correct video/mp4 MIME + Range).
# Override R2_REMOTE/R2_BUCKET on the make line to match your rclone setup.
R2_REMOTE ?= r2-light-slides
R2_BUCKET ?= light-slides-videos
RELEASE_URL := https://pub-a271a0a11bfd40dfaf71d6e928f27eea.r2.dev

# Targets
.PHONY: run run-local verify-local test format environment fetch cues build release-media clean deep-clean help

all: environment test run

run:
	@$(CONDA_PYTHON) -m http.server $(SERVE_PORT) --directory $(SITE)

# Publish-faithful local test: test tree (local encodes rewired to relative
# URLs; everything else byte-identical) served with Range support at the
# production /light_slides subpath. stdlib-only; no conda env needed.
# Kills any stale server on the port first, so re-running always serves
# the freshly built tree (never last week's cues).
run-local:
	@pkill -f "serve_local.py --dir $(LOCAL_TEST_DIR)" 2>/dev/null || true
	@python3 $(PIPELINE)/local_test_tree.py --site $(SITE) --out $(LOCAL_TEST_DIR)
	@python3 $(PIPELINE)/serve_local.py --dir $(LOCAL_TEST_DIR) --port $(LOCAL_PORT)

# Headless-browser pass over run-local: video/seek/captions/search/overflow + screenshots.
# Puppeteer lives in pipeline/node_modules (gitignored); installed on first run.
verify-local:
	@python3 $(PIPELINE)/local_test_tree.py --site $(SITE) --out $(LOCAL_TEST_DIR)
	@if [ ! -d $(PIPELINE)/node_modules/puppeteer ]; then npm --prefix $(PIPELINE) install --no-save --no-package-lock puppeteer; fi
	@(python3 $(PIPELINE)/serve_local.py --dir $(LOCAL_TEST_DIR) --port $(LOCAL_PORT) & echo $$! > /tmp/ls-local.pid; \
	  sleep 1; \
	  node $(PIPELINE)/verify_local.mjs --origin http://127.0.0.1:$(LOCAL_PORT) --tree $(LOCAL_TEST_DIR); rc=$$?; \
	  kill $$(cat /tmp/ls-local.pid) 2>/dev/null || true; exit $$rc)

# Pipeline: fetch 54 tutorials (video + audio + auto-subs) into $(RAW)
fetch:
	@$(PIPELINE)/fetch_tutorials.sh $(RAW)

# Pipeline: faster-whisper each raw video into $(CUES); skips existing
cues:
	@mkdir -p $(CUES)
	@for src in $(RAW)/*.mp4; do \
		if [ ! -e "$$src" ]; then echo "no raw videos; run 'make fetch' first"; exit 1; fi; \
		stem=$$(basename "$$src" .mp4); \
		sid=$$($(CONDA_PYTHON) $(PIPELINE)/sid.py "$$stem"); \
		dst="$(CUES)/$$sid.json"; \
		if [ -f "$$dst" ]; then echo "-- exists $$sid"; \
		else $(CONDA_PYTHON) $(PIPELINE)/transcribe.py "$$src" "$$dst" --model $(WHISPER_MODEL); fi; \
	done

# Pipeline: encode + posters + slides.json into $(SITE)
build:
	@$(CONDA_PYTHON) $(PIPELINE)/build.py --raw $(RAW) --cues $(CUES) --release $(RELEASE_URL) --out $(SITE)

# Upload encoded videos to the R2 media bucket (the viewer streams these; repo stays small)
release-media:
	@rclone copy $(SITE)/assets/vids/ $(R2_REMOTE):$(R2_BUCKET)/ --progress

# Cleanup directory
CLEAN := $(PIPELINE)/**/__pycache__ $(CURDIR)/.pytest_cache
DEEP_CLEAN := $(RAW) $(CUES)

test:
	@$(CONDA_PYTHON) $(PIPELINE)/check.py $(SITE)

format:
	@$(CONDA_PYTHON) -m ruff format .
	@npx --yes prettier --write "prototype/*.js" "prototype/*.css" "docs/*.js" "docs/*.css"

environment: $(CONDA_ENV_YML)
	@if conda info --envs | awk '{print $$1}' | grep -qx "$(CONDA_ENV_ID)"; then \
		echo "Environment '$$name' already exists. Skipping..."; \
	else \
		echo "Creating environment: $(CONDA_ENV_ID) from $(CONDA_ENV_YML)"; \
		conda env create -n "$(CONDA_ENV_ID)" -f "$(CONDA_ENV_YML)"; \
	fi

clean:
	@echo "==> Cleaning ..."
	@for item in $(CLEAN); do \
		safe_rm() { \
			if [ -e "$$1" ]; then \
				ABS_PATH=$$(realpath "$$1"); \
				case "$$ABS_PATH" in \
					$(PROJECT_ROOT)*) \
						echo "-> Safely removing\n   $$ABS_PATH"; \
						rm -rf "$$ABS_PATH";; \
					*) \
						echo "!! Skipping (outside project root)\n   $$ABS_PATH";; \
				esac; \
			else \
				echo "-- Skipping (not found)\n   $$1"; \
			fi; \
		}; \
		safe_rm "$$item"; \
	done
	@find . -name ".DS_Store" -type f -delete

deep-clean:
	@echo "==> Deep cleaning ..."
	@for item in $(DEEP_CLEAN); do \
		safe_rm() { \
			if [ -e "$$1" ]; then \
				ABS_PATH=$$(realpath "$$1"); \
				case "$$ABS_PATH" in \
					$(PROJECT_ROOT)*) \
						echo "-> Safely removing\n   $$ABS_PATH"; \
						rm -rf "$$ABS_PATH";; \
					*) \
						echo "!! Skipping (outside project root)\n   $$ABS_PATH";; \
				esac; \
			else \
				echo "-- Skipping (not found)\n   $$1"; \
			fi; \
		}; \
		safe_rm "$$item"; \
	done


help:
	@echo "Available targets:"
	@echo "  run          Serve the viewer locally"
	@echo "  run-local    Serve publish-faithful test tree (local video, Range seeks, /light_slides subpath)"
	@echo "  verify-local Headless-browser pass over run-local (video/seek/captions/search/overflow)"
	@echo "  fetch        Download 54 tutorials + auto-subs into pipeline/raw"
	@echo "  cues         Transcribe raw videos with faster-whisper into pipeline/cues"
	@echo "  build        Encode + posters + slides.json into the docs dir"
	@echo "  release-media Upload encoded videos to the R2 media bucket"
	@echo "  test         Validate slides.json and its referenced assets"
	@echo "  format       Format code to 150 columns (ruff + prettier)"
	@echo "  environment  Create Conda environment"
	@echo "  clean        Cleanup unnecessary files and directories (safe)"
	@echo "  deep-clean   Remove raw downloads and cues (re-fetch/re-transcribe!)"
	@echo "  help         Show this help message"
