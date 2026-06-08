use std::path::Path;
use windows::core::PCWSTR;
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, SelectObject,
    BITMAP, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, HBITMAP,
};
use windows::Win32::System::Com::{
    CoInitializeEx, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
};
use windows::Win32::UI::Shell::{
    IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_THUMBNAILONLY,
};

pub fn get_system_thumbnail(file_path: &str, cache_path: &Path) -> bool {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);

        let wide: Vec<u16> = std::os::windows::ffi::OsStrExt::encode_wide(
            std::ffi::OsStr::new(file_path)
        ).chain(Some(0)).collect();

        let factory: IShellItemImageFactory = match SHCreateItemFromParsingName(
            PCWSTR(wide.as_ptr()),
            None,
        ) {
            Ok(f) => f,
            Err(_) => return false,
        };

        let size = SIZE { cx: 120, cy: 120 };
        let hbmp = match factory.GetImage(size, SIIGBF_THUMBNAILONLY) {
            Ok(r) => r,
            Err(_) => return false,
        };

        // 获取 BITMAP 信息
        let mut bmp: BITMAP = std::mem::zeroed();
        if GetObjectW(
            HBITMAP(hbmp.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bmp as *mut _ as *mut _),
        ) == 0
        {
            let _ = DeleteObject(hbmp);
            return false;
        }

        let width = bmp.bmWidth;
        let height = bmp.bmHeight.abs();
        let mut pixels = vec![0u8; (width * height * 4) as usize];

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // 负值表示自上而下的 DIB
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0,
                biSizeImage: (width * height * 4) as u32,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [windows::Win32::Graphics::Gdi::RGBQUAD::default(); 1],
        };

        let hdc = CreateCompatibleDC(None);
        let old = SelectObject(hdc, hbmp);

        let result = GetDIBits(
            hdc,
            hbmp,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc, old);
        let _ = DeleteDC(hdc);
        let _ = DeleteObject(hbmp);

        if result == 0 {
            return false;
        }

        // BGRA -> RGBA
        for chunk in pixels.chunks_exact_mut(4) {
            let b = chunk[0];
            chunk[0] = chunk[2]; // R
            chunk[2] = b;        // B
            // G 和 A 不变
        }

        let img = match image::RgbaImage::from_raw(width as u32, height as u32, pixels) {
            Some(i) => image::DynamicImage::ImageRgba8(i),
            None => return false,
        };

        let rgb = img.to_rgb8();
        let mut output = match std::fs::File::create(cache_path) {
            Ok(f) => f,
            Err(_) => return false,
        };
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, 85);
        let _ = image::ImageEncoder::write_image(
            encoder,
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        );

        true
    }
}
