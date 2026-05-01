#!/usr/bin/env python3
"""
Export YOLO .pt model to ONNX and OpenVINO IR for fast CPU inference.

Usage (from the backend/ directory, with majorenv activated):
    python export_onnx.py

Outputs (next to the source .pt file):
    - yolo_v26_best.onnx
    - yolo_v26_best_openvino_model/   (OpenVINO IR: .xml + .bin)
"""
import os
import sys
import time

# -------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------
PT_WEIGHTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "yolo_v26_best.pt")
IMG_SIZE = 640

# -------------------------------------------------------------------
# Main
# -------------------------------------------------------------------
def main():
    if not os.path.isfile(PT_WEIGHTS):
        print(f"[ERROR] .pt weights not found at:\n  {PT_WEIGHTS}")
        sys.exit(1)

    from ultralytics import YOLO

    print(f"\n{'='*60}")
    print("  YOLO Model Export  —  .pt → ONNX → OpenVINO")
    print(f"{'='*60}")
    print(f"  Source : {PT_WEIGHTS}")
    print(f"  ImgSz  : {IMG_SIZE}")
    print()

    model = YOLO(PT_WEIGHTS)
    print(f"  Classes: {model.names}")
    print(f"  Task   : {model.task}")
    print()

    # ------------------------------------------------------------------
    # Step 1: Export to ONNX
    # ------------------------------------------------------------------
    print("[1/3] Exporting to ONNX …")
    t0 = time.time()
    onnx_path = model.export(
        format="onnx",
        imgsz=IMG_SIZE,
        opset=17,
        simplify=True,
        half=False,
    )
    dt_onnx = time.time() - t0
    print(f"  → ONNX saved: {onnx_path}  ({dt_onnx:.1f}s)")
    onnx_size = os.path.getsize(onnx_path) / (1024 * 1024)
    print(f"  → Size: {onnx_size:.1f} MB")
    print()

    # ------------------------------------------------------------------
    # Step 2: Export to OpenVINO IR
    # ------------------------------------------------------------------
    print("[2/3] Exporting to OpenVINO IR …")
    t0 = time.time()
    ov_path = model.export(
        format="openvino",
        imgsz=IMG_SIZE,
        half=False,
    )
    dt_ov = time.time() - t0
    print(f"  → OpenVINO saved: {ov_path}  ({dt_ov:.1f}s)")
    print()

    # ------------------------------------------------------------------
    # Step 3: Quick benchmark — PyTorch vs ONNX vs OpenVINO
    # ------------------------------------------------------------------
    print("[3/3] Running quick benchmark (5 warm-up + 20 inferences each) …")
    import numpy as np

    dummy = np.random.randint(0, 255, (IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)

    def bench(label, model_path, runs=20, warmup=5):
        m = YOLO(model_path)
        for _ in range(warmup):
            m.predict(dummy, imgsz=IMG_SIZE, verbose=False)
        t0 = time.time()
        for _ in range(runs):
            m.predict(dummy, imgsz=IMG_SIZE, verbose=False)
        elapsed = time.time() - t0
        avg_ms = (elapsed / runs) * 1000
        print(f"  {label:20s}  →  {avg_ms:7.1f} ms/frame  ({runs / elapsed:.1f} FPS)")
        return avg_ms

    pt_ms = bench("PyTorch (.pt)", PT_WEIGHTS)
    onnx_ms = bench("ONNX (.onnx)", onnx_path)
    ov_ms = bench("OpenVINO (IR)", ov_path)

    print()
    fastest = min(pt_ms, onnx_ms, ov_ms)
    print(f"  Fastest: {'PyTorch' if fastest == pt_ms else 'ONNX' if fastest == onnx_ms else 'OpenVINO'} "
          f"({fastest:.1f} ms/frame)")
    print()
    print("Done! The backend will auto-detect and use the fastest available format.")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
