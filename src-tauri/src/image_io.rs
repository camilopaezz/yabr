use image::DynamicImage;

use crate::error::AppError;

pub fn decode(_bytes: &[u8]) -> Result<DynamicImage, AppError> {
    todo!()
}

pub fn encode_png_rgba(
    _rgba: &[u8],
    _width: u32,
    _height: u32,
) -> Result<Vec<u8>, AppError> {
    todo!()
}
