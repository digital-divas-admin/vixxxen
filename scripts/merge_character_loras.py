#!/usr/bin/env python3
"""
Merge Character LoRAs into Base Qwen Model

Creates pre-merged checkpoints for each character to eliminate
the ~35 second LoRA switch penalty during generation.

Run this on the RunPod GPU Pod:
  cd /workspace/ComfyUI
  source venv/bin/activate
  python /path/to/merge_character_loras.py

Output:
  - models/unet/qwen_ava_merged.safetensors
  - models/unet/qwen_eve_merged.safetensors
  - models/unet/qwen_suyeon_merged.safetensors
"""

import os
import torch
from safetensors.torch import load_file, save_file
from tqdm import tqdm
import gc

# Paths (relative to /workspace/ComfyUI)
BASE_MODEL = "models/unet/qwen_image_bf16.safetensors"
OUTPUT_DIR = "models/unet"

# LoRAs to merge (in order of application)
# Character LoRA varies per output, others are constant
COMMON_LORAS = [
    ("models/loras/qwen-boreal-portraits-portraits-high-rank.safetensors", 0.6),
    ("models/loras/Qwen-Image-Lightning-4steps-V2.0.safetensors", 1.0),
]

CHARACTER_LORAS = {
    "ava": ("models/loras/vixxxen-prefabs/Ava_QWEN_v1.safetensors", 1.0),
    "eve": ("models/loras/vixxxen-prefabs/Eve_QWEN_v1.safetensors", 1.0),
    "suyeon": ("models/loras/vixxxen-prefabs/Suyeon_QWEN_v1.safetensors", 1.0),
}


def apply_lora_to_weights(base_weights, lora_weights, strength=1.0):
    """
    Apply LoRA weights to base model weights.

    LoRA format typically has keys like:
    - lora_unet_xxx.lora_down.weight
    - lora_unet_xxx.lora_up.weight

    The merged weight = base + (up @ down) * strength * scale
    """
    merged = {k: v.clone() for k, v in base_weights.items()}

    # Find all LoRA pairs
    lora_keys = set()
    for key in lora_weights.keys():
        if '.lora_down.' in key:
            base_key = key.replace('.lora_down.weight', '')
            lora_keys.add(base_key)
        elif '.lora_A.' in key:  # Alternative naming
            base_key = key.replace('.lora_A.weight', '')
            lora_keys.add(base_key)

    applied = 0
    for lora_key in tqdm(lora_keys, desc="Applying LoRA weights", leave=False):
        # Try different naming conventions
        down_key = None
        up_key = None
        alpha_key = None

        # Convention 1: lora_down/lora_up
        if f"{lora_key}.lora_down.weight" in lora_weights:
            down_key = f"{lora_key}.lora_down.weight"
            up_key = f"{lora_key}.lora_up.weight"
            alpha_key = f"{lora_key}.alpha"
        # Convention 2: lora_A/lora_B
        elif f"{lora_key}.lora_A.weight" in lora_weights:
            down_key = f"{lora_key}.lora_A.weight"
            up_key = f"{lora_key}.lora_B.weight"
            alpha_key = f"{lora_key}.alpha"

        if down_key is None or down_key not in lora_weights:
            continue
        if up_key not in lora_weights:
            continue

        down = lora_weights[down_key]
        up = lora_weights[up_key]

        # Get alpha (rank scaling)
        alpha = lora_weights.get(alpha_key, torch.tensor(down.shape[0]))
        if isinstance(alpha, torch.Tensor):
            alpha = alpha.item()

        rank = down.shape[0]
        scale = alpha / rank if rank > 0 else 1.0

        # Map LoRA key to base model key
        # Remove "lora_unet_" prefix and convert to base model format
        base_key = lora_key
        if base_key.startswith("lora_unet_"):
            base_key = base_key[10:]  # Remove "lora_unet_"

        # Try to find matching key in base model
        # Handle various naming transformations
        base_key_candidates = [
            base_key,
            base_key.replace("_", "."),
            f"model.diffusion_model.{base_key}",
            f"model.diffusion_model.{base_key.replace('_', '.')}",
        ]

        target_key = None
        for candidate in base_key_candidates:
            if candidate in merged:
                target_key = candidate
                break
            # Try with .weight suffix
            if f"{candidate}.weight" in merged:
                target_key = f"{candidate}.weight"
                break

        if target_key is None:
            continue

        # Compute LoRA delta: up @ down (for linear layers)
        # Shape handling for different layer types
        try:
            if len(down.shape) == 2 and len(up.shape) == 2:
                # Linear layer: delta = up @ down
                delta = (up @ down) * scale * strength
            elif len(down.shape) == 4 and len(up.shape) == 4:
                # Conv2d layer
                # down: [rank, in_ch, kh, kw], up: [out_ch, rank, 1, 1]
                delta = torch.einsum('orhw,rich->oicw', up, down) * scale * strength
                if delta.shape != merged[target_key].shape:
                    # Reshape if needed
                    delta = delta.reshape(merged[target_key].shape)
            else:
                continue

            # Apply delta
            if delta.shape == merged[target_key].shape:
                merged[target_key] = merged[target_key].to(delta.dtype) + delta
                applied += 1
        except Exception as e:
            # Skip incompatible layers
            continue

    print(f"    Applied {applied} LoRA weight pairs")
    return merged


def merge_loras_for_character(character_name, character_lora_path, character_strength):
    """Merge all LoRAs for a specific character into the base model."""

    print(f"\n{'='*60}")
    print(f"Creating merged model for: {character_name.upper()}")
    print(f"{'='*60}")

    # Load base model
    print(f"\n1. Loading base model: {BASE_MODEL}")
    base_weights = load_file(BASE_MODEL)
    print(f"   Loaded {len(base_weights)} weight tensors")

    # Apply character LoRA first
    print(f"\n2. Applying character LoRA: {os.path.basename(character_lora_path)} (strength={character_strength})")
    if os.path.exists(character_lora_path):
        char_lora = load_file(character_lora_path)
        base_weights = apply_lora_to_weights(base_weights, char_lora, character_strength)
        del char_lora
        gc.collect()
    else:
        print(f"   WARNING: Character LoRA not found at {character_lora_path}")

    # Apply common LoRAs
    for lora_path, strength in COMMON_LORAS:
        print(f"\n3. Applying LoRA: {os.path.basename(lora_path)} (strength={strength})")
        if os.path.exists(lora_path):
            lora_weights = load_file(lora_path)
            base_weights = apply_lora_to_weights(base_weights, lora_weights, strength)
            del lora_weights
            gc.collect()
        else:
            print(f"   WARNING: LoRA not found at {lora_path}")

    # Save merged model
    output_path = os.path.join(OUTPUT_DIR, f"qwen_{character_name}_merged.safetensors")
    print(f"\n4. Saving merged model to: {output_path}")

    # Convert to bf16 for consistency
    merged_bf16 = {k: v.to(torch.bfloat16) if v.dtype == torch.float32 else v
                   for k, v in base_weights.items()}

    save_file(merged_bf16, output_path)

    # Get file size
    size_gb = os.path.getsize(output_path) / (1024**3)
    print(f"   Saved! Size: {size_gb:.2f} GB")

    del base_weights, merged_bf16
    gc.collect()
    torch.cuda.empty_cache() if torch.cuda.is_available() else None

    return output_path


def main():
    print("\n" + "="*60)
    print("  QWEN CHARACTER LORA MERGER")
    print("  Eliminates 35s LoRA switch penalty")
    print("="*60)

    # Check we're in the right directory
    if not os.path.exists(BASE_MODEL):
        print(f"\nERROR: Base model not found at {BASE_MODEL}")
        print("Make sure you're running this from /workspace/ComfyUI")
        return 1

    # Create output directory if needed
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Merge each character
    created_models = []
    for char_name, (lora_path, strength) in CHARACTER_LORAS.items():
        try:
            output = merge_loras_for_character(char_name, lora_path, strength)
            created_models.append((char_name, output))
        except Exception as e:
            print(f"\nERROR merging {char_name}: {e}")
            import traceback
            traceback.print_exc()

    # Summary
    print("\n" + "="*60)
    print("  SUMMARY")
    print("="*60)
    print("\nCreated merged models:")
    for char_name, path in created_models:
        print(f"  - {char_name}: {path}")

    print("\nNext steps:")
    print("  1. Update the workflow to use UNETLoader with merged checkpoints")
    print("  2. Remove Power Lora Loader from workflow")
    print("  3. Route requests to appropriate merged model based on character")

    return 0


if __name__ == "__main__":
    exit(main())
