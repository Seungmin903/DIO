"""Compare observed app memory using local, five-second ADB sample logs."""

import argparse
from datetime import datetime
import json
from pathlib import Path
import re
import statistics

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def read_samples(directory):
    path = directory / "samples.jsonl"
    if not path.exists():
        raise ValueError(f"Missing samples: {path}")
    samples = [json.loads(line) for line in path.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if not samples:
        raise ValueError(f"Empty samples: {path}")
    for sample in samples:
        raw = sample.get("memoryRaw", "")
        for key, label in (("totalRssKb", "TOTAL RSS"), ("swapPssKb", "TOTAL SWAP PSS")):
            match = re.search(rf"{label}:\s*([\d.]+)", raw)
            sample[key] = float(match.group(1)) if match else sample.get(key)
        total, swap = sample.get("totalPssKb"), sample.get("swapPssKb")
        sample["residentPssKb"] = total - swap if total is not None and swap is not None else None
        sample["timestamp"] = datetime.fromisoformat(sample["utc"].replace("Z", "+00:00")).timestamp()
        if total is not None and swap is not None and total < swap:
            raise ValueError("Swap PSS exceeds TOTAL PSS")
    return samples


def statistics_for(samples):
    metrics = {}
    for key in ("totalPssKb", "residentPssKb", "swapPssKb", "totalRssKb"):
        values = [s[key] / 1024 for s in samples if s.get(key) is not None]
        metrics[key.replace("Kb", "MiB")] = {
            "min": min(values), "median": statistics.median(values), "max": max(values)
        } if values else None
    peak = max((s for s in samples if s.get("totalPssKb") is not None), key=lambda s: s["totalPssKb"])
    temps = [s["batteryTemperatureC"] for s in samples if s.get("batteryTemperatureC") is not None]
    sensors = {}
    for name in ("AP", "SKIN"):
        values = [sensor["valueC"] for s in samples for sensor in s.get("thermalSensorsCurrentHal", []) if sensor["name"] == name]
        sensors[name] = {"start": values[0], "max": max(values), "end": values[-1]} if values else None
    metrics.update({
        "samples": len(samples),
        "sampledSpanSeconds": samples[-1]["timestamp"] - samples[0]["timestamp"],
        "atPeakTotalPss": {key.replace("Kb", "MiB"): peak[key] / 1024 if peak.get(key) is not None else None
                           for key in ("totalPssKb", "residentPssKb", "swapPssKb", "totalRssKb")},
        "peakTotalPssUtc": peak["utc"],
        "batteryC": {"start": temps[0], "max": max(temps), "end": temps[-1]} if temps else None,
        "deviceReportedSensorsC": sensors,
        "thermalStatusMax": max(s["thermalStatus"] for s in samples if s.get("thermalStatus") is not None),
        "usbPoweredValues": sorted(set(s.get("usbPowered", "unknown") for s in samples)),
    })
    return metrics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--font", type=Path, required=True)
    parser.add_argument("--game", type=Path, required=True)
    args = parser.parse_args()
    font = sum((read_samples(args.font / phase) for phase in ("full-first", "full-resume-1", "full-resume-2")), [])
    font.sort(key=lambda s: s["timestamp"])
    menu = read_samples(args.game / "menu")
    play = read_samples(args.game / "play")
    marker = args.game / "combat-start-utc.txt"
    combat_start = datetime.fromisoformat(marker.read_text(encoding="utf-8-sig").strip().replace("Z", "+00:00")).timestamp()
    combat = [s for s in play if s["timestamp"] >= combat_start]
    if not combat:
        raise ValueError("No samples after confirmed combat screen")
    first_ten = [s for s in read_samples(args.font / "full-first") if s["elapsedSeconds"] <= 600]
    summary = {
        "schema": 1, "device": "SM-S921N", "gamePackage": "com.poncle.vampiresurvivors",
        "gameVersion": "1.16.107", "fontAllExecutionSegments": statistics_for(font),
        "fontFirstTenMinutes": statistics_for(first_ten),
        "gameLaunchAndMenu": statistics_for(menu),
        "gameCombatAndLevelUp": statistics_for(combat),
        "conditions": "Same phone, USB charging, five-second ADB sampling. Different start temperatures and durations. Game includes level-up selection pauses and only early stage gameplay; no claim about late-game peaks, power consumption or FPS.",
        "memoryDefinition": "TOTAL PSS includes SWAP PSS on this Android build. Resident PSS = TOTAL PSS - SWAP PSS. Swap PSS is the uncompressed equivalent, not compressed physical RAM. RSS counts shared resident pages in full. Peaks of distinct metrics can occur at different timestamps.",
    }
    summary["fontToGamePeakTotalPssRatio"] = summary["fontAllExecutionSegments"]["totalPssMiB"]["max"] / summary["gameCombatAndLevelUp"]["totalPssMiB"]["max"]
    (args.game / "comparison.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    fig, axes = plt.subplots(2, 2, figsize=(12, 7), layout="constrained")
    series = ((first_ten, "Font: first 10 min", "#3767ad"), (combat, "Vampire Survivors: combat + level-up", "#b33d43"))
    for samples, label, color in series:
        x = [(s["timestamp"] - samples[0]["timestamp"]) / 60 for s in samples]
        for ax, key, title in ((axes[0, 0], "totalPssKb", "TOTAL PSS (includes swap)"),
                               (axes[0, 1], "residentPssKb", "Resident PSS (excludes swap)"),
                               (axes[1, 0], "swapPssKb", "Swap PSS (before compression)")):
            ax.plot(x, [s.get(key, float("nan")) / 1024 if s.get(key) is not None else float("nan") for s in samples], label=label, color=color)
            ax.set_title(title)
            ax.set_ylabel("MiB")
        axes[1, 1].plot(x, [s.get("batteryTemperatureC", float("nan")) for s in samples], label=label, color=color)
    axes[1, 1].set_title("Battery temperature (different initial conditions)")
    axes[1, 1].set_ylabel("C")
    for ax in axes.flat:
        ax.grid(alpha=.2)
        ax.set_xlabel("Minutes from first sample in this segment")
    handles, labels = axes[0, 0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="outside lower center", ncols=2)
    fig.suptitle("SM-S921N | USB charging | observed every 5 s\nEarly gameplay comparison, not a late-game or energy benchmark")
    fig.savefig(args.game / "comparison.png", dpi=150)
    plt.close(fig)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
