"""Summarize local ADB observations, keeping sampled and exact values distinct."""
import argparse
import datetime as dt
import json
import math
from pathlib import Path


def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    parser.add_argument('--allow-incomplete', action='store_true')
    args = parser.parse_args()
    folder = Path(args.run)
    metadata = load(folder / 'full-first/metadata.json')
    segments = load(folder / 'segments.json') if (folder / 'segments.json').exists() else []
    paths = [folder / p['samples'] for p in segments] if segments else [folder / 'full-first/samples.jsonl']
    samples = [json.loads(line) for path in paths for line in path.read_text(encoding='utf-8-sig').splitlines() if line.strip()]
    samples.sort(key=lambda s: s['utc'])
    action = load(folder / 'full-action.json')
    clicked = dt.datetime.fromisoformat(action['beforeButtonUtc'].replace('Z', '+00:00'))
    jobs = [s for s in samples if s.get('job')]
    processing_samples = [s for s in jobs if s['job']['state'] == 'processing']
    if not jobs:
        raise ValueError('No observed job')
    last = jobs[-1]
    complete = last['job']['state'] == 'ready' and last['job']['completed'] == 11172
    if not complete and not args.allow_incomplete:
        raise ValueError('Job is not complete; use --allow-incomplete for a clearly labelled interim result')

    def time(s):
        return (dt.datetime.fromisoformat(s['utc'].replace('Z', '+00:00')) - clicked).total_seconds()

    def values(key):
        return [s[key] for s in samples if isinstance(s.get(key), (int, float)) and math.isfinite(s[key])]

    def sensor(s, name):
        return next((p['valueC'] for p in s.get('thermalSensorsCurrentHal', []) if p['name'] == name), None)

    native_seconds = None
    active_seconds = None
    pause_seconds = sum(segments[i + 1]['startEpoch'] - s['endEpoch'] for i, s in enumerate(segments[:-1])) if segments else 0
    if complete:
        native_seconds = int(last['stateEpochSeconds']) - int(last['jobInputEpochSeconds'])
        active_seconds = sum((s['endEpoch'] if s['endEpoch'] is not None else int(last['stateEpochSeconds'])) - s['startEpoch'] for s in segments) if segments else native_seconds
    thermal = values('thermalStatus')
    pss = values('totalPssKb')
    battery = values('batteryTemperatureC')
    before = [s for s in samples if time(s) <= 0]
    start_sample = before[-1] if before else samples[0]
    sensor_results = {}
    for name in ['AP', 'SKIN', 'BAT']:
        readings = [sensor(s, name) for s in samples]
        readings = [v for v in readings if v is not None and math.isfinite(v)]
        active_readings = [sensor(s, name) for s in processing_samples]
        active_readings = [v for v in active_readings if v is not None and math.isfinite(v)]
        sensor_results[name] = {'startC': sensor(start_sample, name), 'maxC': max(readings) if readings else None, 'maxWhileJobReportedProcessingC': max(active_readings) if active_readings else None, 'endC': sensor(last, name), 'source': 'Current temperatures from HAL, device-reported value'}

    completed = [(time(s), s['job']['completed']) for s in jobs if s['job']['stage'] == 'generating']

    def rate(points):
        if len(points) < 2 or points[-1][0] <= points[0][0]:
            return None
        return (points[-1][1] - points[0][1]) / (points[-1][0] - points[0][0])

    early = [p for p in completed if p[0] <= completed[0][0] + 180] if completed else []
    late = [p for p in completed if p[0] >= completed[-1][0] - 180] if completed else []
    summary = {
        'complete': complete, 'trialCount': 1, 'deviceModel': metadata['model'], 'android': metadata['androidRelease'],
        'jobId': metadata['jobId'], 'state': last['job']['state'], 'completed': last['job']['completed'], 'total': last['job']['total'],
        'nativeJobSeconds': native_seconds, 'nativeJobTimingResolutionSeconds': 1,
        'activeNativeSeconds': active_seconds, 'confirmedPauseSeconds': pause_seconds, 'backgroundPauseCount': max(0, len(segments) - 1),
        'nativeJobTimingMethod': 'Wall time: final state mtime minus immutable input mtime. Active time: sum of recorded execution segments, excluding confirmed background pause. Same device clock, one-second resolution; includes cache reads, glyph/outline writes, checkpoints and font build.',
        'charsPerSecondEndToEnd': 11172 / native_seconds if native_seconds else None,
        'charsPerSecondActive': 11172 / active_seconds if active_seconds else None,
        'earlyGenerationCharsPerSecond': rate(early), 'latestGenerationCharsPerSecond': rate(late),
        'latestRateWindowSeconds': late[-1][0] - late[0][0] if len(late) > 1 else None,
        'observedPeakPssMiB': max(pss) / 1024 if pss else None,
        'memoryCaveat': 'PSS observed at nominal five-second intervals; transient allocation peaks can be missed. Includes the React Native development app.',
        'battery': {'startC': start_sample.get('batteryTemperatureC'), 'maxC': max(battery) if battery else None, 'endC': last.get('batteryTemperatureC'), 'usbPoweredValues': sorted(set(s.get('usbPowered', '') for s in samples))},
        'deviceReportedSensors': sensor_results, 'thermalStatusMax': max(thermal) if thermal else None,
        'thermalStatusMaxWhileJobReportedProcessing': max((s['thermalStatus'] for s in processing_samples if s.get('thermalStatus') is not None), default=None),
        'phaseClassificationCaveat': 'Sensors and job state are read sequentially within each sample; transitions can differ by the recorded collection time.',
        'samplingIntervalSeconds': metadata['intervalSeconds'], 'samples': len(samples),
        'collectionSecondsMean': sum(s['collectionSeconds'] for s in samples) / len(samples),
        'measurementConditions': 'USB connected/charging; existing system brightness/settings; FP32 CPU batch 1, two intra-op threads; reference feature cache populated by first preview.',
        'scope': 'One actual phone job with any recorded user background pauses, not an uninterrupted/general benchmark across phones. No energy-consumption inference from charge percentage. Sensor values are not a touch/comfort assessment.',
    }
    target = folder / ('summary.json' if complete else 'summary-interim.json')
    target.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(3, 1, figsize=(11, 9), sharex=True, constrained_layout=True)
    plot_samples = list(samples)
    paused_path = folder / 'paused-observation/samples.jsonl'
    if paused_path.exists():
        plot_samples.extend(json.loads(line) for line in paused_path.read_text(encoding='utf-8-sig').splitlines() if line.strip())
        plot_samples.sort(key=lambda s: s['utc'])
    # Leave visible gaps instead of inventing a temperature/memory curve
    # through intervals that were not observed.
    spaced = []
    for s in plot_samples:
        if spaced and time(s) - time(spaced[-1]) > metadata['intervalSeconds'] * 2.5:
            spaced.append(None)
        spaced.append(s)
    minutes = [time(s) / 60 if s else math.nan for s in spaced]
    for name in ['AP', 'SKIN', 'BAT']:
        axes[0].plot(minutes, [sensor(s, name) if s else math.nan for s in spaced], label=f'{name} (reported)', linewidth=1.5)
    axes[0].set_ylabel('Temperature (C)'); axes[0].legend(loc='upper left', ncol=3); axes[0].grid(alpha=.2)
    axes[1].plot(minutes, [s['totalPssKb'] / 1024 if s and s.get('totalPssKb') is not None else math.nan for s in spaced], color='#314d80')
    axes[1].set_ylabel('Observed PSS (MiB)'); axes[1].grid(alpha=.2)
    counts = [(time(s), s['job']['completed']) for s in jobs]
    for i, segment in enumerate(segments[:-1]):
        counts.extend([(segment['endEpoch'] - clicked.timestamp(), segment['completedEnd']), (segments[i + 1]['startEpoch'] - clicked.timestamp(), segments[i + 1]['completedStart'])])
    counts.sort()
    axes[2].plot([p[0] / 60 for p in counts], [p[1] for p in counts], color='#2b7558', label='Generated glyphs')
    axes[2].set_ylabel('Completed glyphs'); axes[2].set_xlabel('Minutes since generate button'); axes[2].grid(alpha=.2)
    axes[2].set_ylim(0, 11172)
    rate_times, rates = [], []
    for i, point in enumerate(completed):
        earlier = next((p for p in reversed(completed[:i]) if point[0] - p[0] >= 60), None)
        crosses_pause = earlier is not None and any(earlier[0] < segments[j + 1]['startEpoch'] - clicked.timestamp() and point[0] > s['endEpoch'] - clicked.timestamp() for j, s in enumerate(segments[:-1]))
        if earlier:
            rate_times.append(point[0] / 60); rates.append(math.nan if crosses_pause else (point[1] - earlier[1]) / (point[0] - earlier[0]))
    other = axes[2].twinx(); other.plot(rate_times, rates, color='#b27028', alpha=.85, label='60s average glyphs/s'); other.set_ylabel('Glyphs / second')
    lines = axes[2].get_lines() + other.get_lines()
    axes[2].legend(lines, [line.get_label() for line in lines], loc='upper left', ncol=2)
    for i, segment in enumerate(segments[:-1]):
        left = (segment['endEpoch'] - clicked.timestamp()) / 60
        right = (segments[i + 1]['startEpoch'] - clicked.timestamp()) / 60
        for axis in axes:
            axis.axvspan(left, right, color='#888888', alpha=.15)
        axes[0].text((left + right) / 2, axes[0].get_ylim()[1], 'Background pause', rotation=90, ha='center', va='top', fontsize=8)
    fig.suptitle(f"{metadata['model']} - FP32 handwriting generation\n{'Complete' if complete else 'IN PROGRESS'} | USB charging | sampled every {metadata['intervalSeconds']}s")
    fig.savefig(folder / ('measurement.png' if complete else 'measurement-interim.png'), dpi=150)
    plt.close(fig)
    print(json.dumps({k: summary[k] for k in ['complete','completed','nativeJobSeconds','observedPeakPssMiB','battery','thermalStatusMax']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
