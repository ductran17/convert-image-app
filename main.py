import io
import os
import sys
import zipfile
import webbrowser
import tempfile
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, FileResponse
from PIL import Image
import pillow_heif
import rawpy
import numpy as np

# Register HEIF/HEIC format with Pillow
pillow_heif.register_heif_opener()

# RAW file extensions
RAW_EXTENSIONS = {
    '.cr2', '.cr3',  # Canon
    '.nef', '.nrw',  # Nikon
    '.arw', '.srf', '.sr2',  # Sony
    '.orf',  # Olympus
    '.rw2',  # Panasonic
    '.dng',  # Adobe/Universal
    '.raw', '.rwl',  # Leica
    '.raf',  # Fuji
    '.pef', '.ptx',  # Pentax
    '.x3f',  # Sigma
    '.srw',  # Samsung
    '.erf',  # Epson
    '.mrw',  # Minolta
    '.3fr',  # Hasselblad
    '.mef',  # Mamiya
    '.mos',  # Leaf
    '.kdc', '.dcr',  # Kodak
}

app = FastAPI(title="Image Converter")


def get_base_path() -> Path:
    """Get the base path for resources, handling both dev and frozen exe modes."""
    if getattr(sys, 'frozen', False):
        # Running as compiled exe (PyInstaller)
        return Path(sys._MEIPASS)
    else:
        # Running as script
        return Path(__file__).parent


# Get static directory path
base_path = get_base_path()
static_dir = base_path / "static"

# Mount static files
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Supported formats
SUPPORTED_INPUT_FORMATS = {"PNG", "JPG", "JPEG", "GIF", "WEBP", "HEIC", "RAW"}
SUPPORTED_OUTPUT_FORMATS = {"PNG", "JPG", "JPEG", "GIF", "WEBP"}
FORMAT_EXTENSIONS = {
    "PNG": "png",
    "JPG": "jpg",
    "JPEG": "jpg",
    "GIF": "gif",
    "WEBP": "webp",
    "HEIC": "heic",
}
FORMAT_MIME_TYPES = {
    "PNG": "image/png",
    "JPG": "image/jpeg",
    "JPEG": "image/jpeg",
    "GIF": "image/gif",
    "WEBP": "image/webp",
    "HEIC": "image/heic",
}


def is_raw_file(filename: str) -> bool:
    """Check if file is a RAW image based on extension."""
    ext = Path(filename).suffix.lower()
    return ext in RAW_EXTENSIONS


def open_raw_image(contents: bytes, filename: str) -> Image.Image:
    """Open a RAW image file and convert to PIL Image."""
    # rawpy needs a file path, so we use a temp file
    ext = Path(filename).suffix.lower()
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        with rawpy.imread(tmp_path) as raw:
            # Process the RAW image with default settings
            rgb = raw.postprocess(
                use_camera_wb=True,  # Use camera white balance
                half_size=False,     # Full resolution
                no_auto_bright=False,
                output_bps=8,        # 8-bit output
            )
        # Convert numpy array to PIL Image
        img = Image.fromarray(rgb)
        return img
    finally:
        # Clean up temp file
        os.unlink(tmp_path)


@app.get("/")
async def root():
    """Serve the main HTML page."""
    return FileResponse(static_dir / "index.html")


@app.post("/convert")
async def convert_images(
    files: List[UploadFile] = File(...),
    target_format: str = Form(...),
    quality: int = Form(85),
    width: Optional[int] = Form(None),
    height: Optional[int] = Form(None),
    resize_percent: Optional[int] = Form(None),
    maintain_aspect_ratio: bool = Form(True),
):
    """
    Convert uploaded images to the target format.

    Args:
        files: List of image files to convert
        target_format: Target format (PNG, JPG, JPEG, GIF, WEBP)
        quality: Quality/compression level (1-100)
        width: Optional new width
        height: Optional new height
        maintain_aspect_ratio: Whether to maintain aspect ratio when resizing

    Returns:
        Single converted image or ZIP file containing all converted images
    """
    target_format = target_format.upper()

    # Validate target format
    if target_format not in SUPPORTED_OUTPUT_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported target format: {target_format}. Supported output formats: PNG, JPG, JPEG, GIF, WEBP"
        )

    # Validate quality
    quality = max(1, min(100, quality))

    converted_images = []

    for file in files:
        try:
            # Read the image
            contents = await file.read()

            # Check if it's a RAW file
            if is_raw_file(file.filename):
                img = open_raw_image(contents, file.filename)
            else:
                img = Image.open(io.BytesIO(contents))

            # Convert to RGB if necessary (for JPG/JPEG which don't support alpha)
            if target_format in ("JPG", "JPEG") and img.mode in ("RGBA", "P"):
                # Create white background
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                background.paste(img, mask=img.split()[3] if len(img.split()) == 4 else None)
                img = background
            elif target_format in ("JPG", "JPEG") and img.mode != "RGB":
                img = img.convert("RGB")

            # Handle GIF (convert to RGB or RGBA)
            if target_format == "GIF" and img.mode not in ("RGB", "RGBA", "P"):
                img = img.convert("RGB")

            # Resize if percentage or dimensions provided
            original_width, original_height = img.size

            if resize_percent and resize_percent != 100:
                # Percentage-based resize
                scale = resize_percent / 100
                new_width = int(original_width * scale)
                new_height = int(original_height * scale)
                if new_width > 0 and new_height > 0:
                    img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            elif width or height:
                # Dimension-based resize
                if maintain_aspect_ratio:
                    if width and height:
                        # Fit within the box while maintaining aspect ratio
                        img.thumbnail((width, height), Image.Resampling.LANCZOS)
                    elif width:
                        # Calculate height based on width
                        ratio = width / original_width
                        new_height = int(original_height * ratio)
                        img = img.resize((width, new_height), Image.Resampling.LANCZOS)
                    elif height:
                        # Calculate width based on height
                        ratio = height / original_height
                        new_width = int(original_width * ratio)
                        img = img.resize((new_width, height), Image.Resampling.LANCZOS)
                else:
                    # Exact resize (may distort)
                    new_width = width or original_width
                    new_height = height or original_height
                    img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

            # Save to buffer
            buffer = io.BytesIO()

            # Get original filename without extension
            original_name = Path(file.filename).stem
            new_extension = FORMAT_EXTENSIONS[target_format]
            new_filename = f"{original_name}.{new_extension}"

            # Save with appropriate options
            save_kwargs = {}
            if target_format in ("JPG", "JPEG"):
                save_kwargs["quality"] = quality
                save_kwargs["optimize"] = True
                img.save(buffer, format="JPEG", **save_kwargs)
            elif target_format == "PNG":
                # PNG compression (0-9, derived from quality)
                compress_level = 9 - int((quality / 100) * 9)
                save_kwargs["compress_level"] = compress_level
                save_kwargs["optimize"] = True
                img.save(buffer, format="PNG", **save_kwargs)
            elif target_format == "WEBP":
                save_kwargs["quality"] = quality
                save_kwargs["method"] = 6  # Best compression method
                img.save(buffer, format="WEBP", **save_kwargs)
            elif target_format == "GIF":
                img.save(buffer, format="GIF", optimize=True)

            buffer.seek(0)
            converted_images.append((new_filename, buffer.getvalue()))

        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Error processing {file.filename}: {str(e)}"
            )

    # Return single file or ZIP
    if len(converted_images) == 1:
        filename, data = converted_images[0]
        return StreamingResponse(
            io.BytesIO(data),
            media_type=FORMAT_MIME_TYPES[target_format],
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    else:
        # Create ZIP file
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for filename, data in converted_images:
                zip_file.writestr(filename, data)

        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="converted_images.zip"'}
        )


@app.get("/formats")
async def get_formats():
    """Return supported input and output formats."""
    return {
        "input_formats": list(SUPPORTED_INPUT_FORMATS),
        "output_formats": list(SUPPORTED_OUTPUT_FORMATS),
    }


if __name__ == "__main__":
    import uvicorn

    # Fix for PyInstaller: redirect stdout/stderr if they are None (windowed mode)
    if sys.stdout is None:
        sys.stdout = open(os.devnull, 'w')
    if sys.stderr is None:
        sys.stderr = open(os.devnull, 'w')

    # Open browser automatically
    webbrowser.open("http://localhost:8000")

    # Run the server with minimal logging config for exe compatibility
    if getattr(sys, 'frozen', False):
        # Running as exe - use simple config to avoid logging issues
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=8000,
            log_config=None,  # Disable default logging config
            access_log=False,
        )
    else:
        # Running as script - normal mode
        uvicorn.run(app, host="0.0.0.0", port=8000)
