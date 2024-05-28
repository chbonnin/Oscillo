# AGATA Oscilloscope Web Application

## General Description

This project utilizes a Python server providing continuous data acquisition to power a web application built with Django. The application offers oscilloscope-like functionality, including:

- **Time and Amplitude Selections**: Users can select specific time frames and amplitude ranges for data analysis.
- **Display Options**: Customize the visualization of data curves.
- **Mathematical Transformations**: Apply mathematical operations to the data for more in-depth analysis.

The application is developed using **JavaScript** on the client side and **Python** on the server side.

## Project Context

**AGATA (Advanced Gamma Tracking Array)** is a European research project aimed at developing and constructing a next-generation 4pi gamma-ray spectrometer. This cutting-edge tool will be utilized in experiments with both intense, stable, and radioactive ion beams to explore the structure of atomic nuclei based on angular momentum, isospin, and temperature at the limits of their stability.

### Spectrometer Design

The complete AGATA spectrometer will feature:

- **180 High-Purity Germanium (HPGe) Crystals**: Each crystal is 9 cm in length and 8 cm in diameter with a hexaconical shape (hexagonal at the front, circular at the back).
- **Segmentation**: Each crystal is electrically segmented into 36 segments (6 longitudinal, 6 transverse).

This setup will allow for precise and detailed gamma-ray tracking and spectroscopy.

---

For more information on how to set up and use the application, see the documentations : 

**Dev Documentation** : https://github.com/Wewenito/Oscillo/tree/main/doc/Documentation%20DEV/index.html
**User Documentation** : https://github.com/Wewenito/Oscillo/blob/main/oscillo/static/DOCS/index.html
**Docker container installation** : https://github.com/Wewenito/Oscillo/blob/main/docker/Procedure_installation.txt
