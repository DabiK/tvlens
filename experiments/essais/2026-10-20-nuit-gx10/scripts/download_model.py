"""Exécuté dans l'image figée, sans GPU ni jeton, hors des mesures."""
from huggingface_hub import snapshot_download

print(snapshot_download('nvidia/Qwen3.8-27B-NVFP4', revision='482ca0f3832238542f8f5295dde86b5f22711d80',
                        cache_dir='/cache', token=False, max_workers=4), flush=True)
