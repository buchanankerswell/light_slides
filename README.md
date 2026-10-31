# Light Slides: a thin-section viewer for teaching mineralogy

📚 See [buchanankerswell.com/light_slides](https://buchanankerswell.com/light_slides) for the live site.

A minimal static viewer for optical mineralogy tutorials: scrub the microscope stage forwards and backwards with a slider and read the synced commentary. Pure HTML, CSS, and vanilla JavaScript; tutorial videos stream from cloud storage so the site stays small.

## Prerequisite software

The viewer runs in any modern web browser; nothing needs installing to use it. Rebuilding the site needs [python](https://www.python.org) via the [miniforge](https://github.com/conda-forge/miniforge) distribution, which includes a minimal python installation and the package manager [conda](https://docs.conda.io/en/latest/).

For macOS users, miniforge can be installed with [homebrew](https://brew.sh):

```bash
brew install miniforge
```

For Window's users, miniforge can be installed from a binary .exe. Follow the instructions for miniconda, anaconda, or miniforge (recommended) [here](https://docs.conda.io/projects/conda/en/stable/user-guide/install/windows.html).

## Installation Guide

No installation is needed to view the site. To work on it locally:

``` bash
# Clone the repository
git clone https://github.com/buchanankerswell/light_slides.git
cd light_slides

# Optional: create the conda environment for rebuilding the site
conda env create -f environment.yml
```

## Usage Guide

Open the [live site](https://buchanankerswell.com/light_slides), or serve it locally:

``` bash
# Serve the viewer (UI at http://127.0.0.1:8811/)
make run
```

Scrub the stage with the slider, press `/` to filter minerals, and `?` for shortcuts. Regenerate the site from raw tutorials with `make fetch cues site`; see `make help` for all targets.

## Citation

```bibtex
@software{light_slides,
  author       = {Kerswell, Buchanan},
  title        = {Light Slides: a thin-section viewer for teaching mineralogy},
  month        = oct,
  year         = 2026,
  publisher    = {Zenodo},
  version      = {latest},
  doi          = {10.5281/zenodo.XXXXXXX},
  url          = {https://doi.org/10.5281/zenodo.XXXXXXX},
}
```

```bibtex
@misc{perkins_optical_mineralogy,
  author       = {Perkins, Dexter and Kohn, Matthew and Brady, John},
  title        = {Optical Mineralogy},
  url          = {https://optical.minpet.org},
}
```

## Acknowledgement

These videos and tutorials were produced by [Matt Kohn](https://scholar.google.com/citations?user=xS1KQAAAAJ&hl=en&oi=ao) (Boise State University) from hours of filming petrographic slides from his own personal research library.

Light Slides accompanies *Optical Mineralogy* by [Dexter Perkins](https://campus.und.edu/directory/dexter.perkins) (University of North Dakota), Matt Kohn (Boise State University), and [John Brady](https://scholar.google.com/citations?user=fZ1icDoAAAAJ&hl=en&oi=sra) (Smith College).

Supported by the University of North Dakota, Boise State University, Smith College, and the National Science Foundation.
