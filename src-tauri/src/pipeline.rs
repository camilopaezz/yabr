use image::{DynamicImage, GrayImage, RgbaImage};
use ndarray::Array4;

use crate::error::AppError;

pub fn preprocess(_image: &DynamicImage, _input_size: u32) -> Result<Array4<f32>, AppError> {
    todo!()
}

pub fn postprocess(
    _output: &ndarray::ArrayD<f32>,
    _original_size: (u32, u32),
) -> Result<GrayImage, AppError> {
    todo!()
}

pub fn apply_alpha(_rgb: &image::RgbImage, _alpha: &GrayImage) -> Result<RgbaImage, AppError> {
    todo!()
}
