from huggingface_hub import hf_hub_download
import os

repo_id = "AIPLUX/paddleocr-ppocrv5-onnx"
dest_folder = "models"

os.makedirs(dest_folder, exist_ok=True)

files = [
    ("det/det.onnx", "det.onnx"),
    ("rec/rec.onnx", "rec.onnx"),
    ("rec/ppocr_keys_v1.txt", "ppocr_keys_v1.txt")
]

for repo_path, local_name in files:
    print(f"Downloading {repo_path}...")
    hf_hub_download(
        repo_id=repo_id,
        filename=repo_path,
        local_dir=dest_folder,
        local_dir_use_symlinks=False
    )
    print(f"Done: {local_name}")
