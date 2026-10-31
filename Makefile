include project.mk

.DEFAULT_GOAL := help

.PHONY: all build run prod-preview verify-local site fetch cues release-media test check-media format environment clean deep-clean help

build: environment test

all: build run

run:
	@$(CONDA_PYTHON) -m http.server $(SERVE_PORT) --directory $(SITE)

prod-preview:
	@pkill -f "serve_local.py --dir $(LOCAL_TEST_DIR)" 2>/dev/null || true
	@python3 $(PIPELINE)/local_test_tree.py --site $(SITE) --out $(LOCAL_TEST_DIR)
	@python3 $(PIPELINE)/serve_local.py --dir $(LOCAL_TEST_DIR) --port $(LOCAL_PORT)

verify-local:
	@python3 $(PIPELINE)/local_test_tree.py --site $(SITE) --out $(LOCAL_TEST_DIR)
	@if [ ! -d $(PIPELINE)/node_modules/puppeteer ]; then npm --prefix $(PIPELINE) install --no-save --no-package-lock puppeteer; fi
	@(python3 $(PIPELINE)/serve_local.py --dir $(LOCAL_TEST_DIR) --port $(LOCAL_PORT) & echo $$! > /tmp/ls-local.pid; \
	  sleep 1; \
	  node $(PIPELINE)/verify_local.mjs --origin http://$(HOST):$(LOCAL_PORT) --tree $(LOCAL_TEST_DIR); rc=$$?; \
	  kill $$(cat /tmp/ls-local.pid) 2>/dev/null || true; exit $$rc)

fetch:
	@$(PIPELINE)/fetch_tutorials.sh $(RAW)

cues:
	@mkdir -p $(CUES)
	@for src in $(RAW)/*.mp4; do \
		if [ ! -e "$$src" ]; then echo " !! no raw videos; run 'make fetch' first"; exit 1; fi; \
		stem=$$(basename "$$src" .mp4); \
		sid=$$($(CONDA_PYTHON) $(PIPELINE)/sid.py "$$stem"); \
		dst="$(CUES)/$$sid.json"; \
		if [ ! -f "$$dst" ]; then $(CONDA_PYTHON) $(PIPELINE)/transcribe.py "$$src" "$$dst" --model $(WHISPER_MODEL); fi; \
	done

site:
	@$(CONDA_PYTHON) $(PIPELINE)/build.py --raw $(RAW) --cues $(CUES) --release $(RELEASE_URL) --out $(SITE)

release-media:
	@rclone copy $(SITE)/assets/vids/ $(R2_REMOTE):$(R2_BUCKET)/ --progress

test:
	@$(CONDA_PYTHON) $(PIPELINE)/check.py $(SITE)

check-media:
	@python3 $(PIPELINE)/check_media.py

format:
	@$(CONDA_PYTHON) -m ruff format .
	@npx --yes prettier --write "prototype/*.js" "prototype/*.css" "docs/*.js" "docs/*.css"

environment: $(CONDA_ENV_YML) $(LOG_FILE)
	@if ! conda info --envs | awk '{print $$1}' | grep -qx "$(CONDA_ENV_ID)"; then \
		conda env create -n "$(CONDA_ENV_ID)" -f "$(CONDA_ENV_YML)" $(LOGGER); \
	fi

clean:
	@echo "    --------------------------------------------------"
	@echo "    Cleaning ..."
	@echo "    --------------------------------------------------"
	@$(call SAFE_RM_LIST,$(CLEAN))
	@find $(PIPELINE) -name "__pycache__" -exec echo " xx {}" \; -exec rm -rf {} +
	@find . -name ".DS_Store" -type f -delete

deep-clean: clean
	@echo "    --------------------------------------------------"
	@echo "    Deep cleaning ..."
	@echo "    --------------------------------------------------"
	@$(call SAFE_RM_LIST,$(DEEP_CLEAN))

$(LOG_FILE):
	@mkdir -p $(dir $(LOG_FILE))
	@touch $(LOG_FILE)

help:
	@echo "    --------------------------------------------------"
	@echo "    Available targets:"
	@echo "    --------------------------------------------------"
	@echo "    build          Build light_slides from scratch (environment + test)"
	@echo "    all            Build then serve the viewer locally"
	@echo "    run            Serve the viewer locally"
	@echo "    prod-preview   Serve publish-faithful tree (local video, Range seeks, /light_slides subpath)"
	@echo "    verify-local   Headless-browser pass over prod-preview (video/seek/captions/search/overflow)"
	@echo "    fetch          Download 54 tutorials + auto-subs into pipeline/raw"
	@echo "    cues           Transcribe raw videos with faster-whisper into pipeline/cues"
	@echo "    site           Encode + posters + slides.json into the docs dir (needs fetch/cues first)"
	@echo "    release-media  Upload encoded videos to the R2 media bucket"
	@echo "    test           Validate slides.json and its referenced assets"
	@echo "    check-media    Verify hosted videos serve video/mp4 with ranges"
	@echo "    format         Format code to 150 columns (ruff + prettier)"
	@echo "    environment    Create Conda environment"
	@echo "    clean          Cleanup unnecessary files and directories (safe)"
	@echo "    deep-clean     Remove raw downloads and cues (re-fetch/re-transcribe!)"
	@echo "    help           Show this help message"
