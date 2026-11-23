import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { ParticleAudioEngine, type AudioStatusSnapshot } from './audio/audioEngine';
import { ControlDock } from './components/ControlDock';
import { TopBar } from './components/TopBar';
import {
  buildRecordingFilename,
  CanvasVideoRecorder,
} from './recording/videoRecorder';
import { ParticleCanvas, type ParticleCanvasHandle } from './scene/ParticleCanvas';
import { getPaletteById } from './simulation/palettes';
import {
  DEFAULT_SIMULATION_PARAMS,
  FLOW_MODE_OPTIONS,
  INTERACTION_MODE_OPTIONS,
  type FlowMode,
  type InteractionMode,
  type PaletteId,
  type SimulationParams,
} from './simulation/types';

export default function App() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_SIMULATION_PARAMS);
  const [dockOpen, setDockOpen] = useState(true);
  const [slidersOpen, setSlidersOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const [pulseCount, setPulseCount] = useState(0);
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [videoSaved, setVideoSaved] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [lastRecordingMeta, setLastRecordingMeta] = useState<{
    bytes: number;
    hasAudio: boolean;
  }>({ bytes: 0, hasAudio: false });
  const [isDragOverAudio, setIsDragOverAudio] = useState(false);

  const audioEngineRef = useRef<ParticleAudioEngine | null>(null);
  if (!audioEngineRef.current) {
    audioEngineRef.current = new ParticleAudioEngine();
  }

  const videoRecorderRef = useRef<CanvasVideoRecorder | null>(null);
  if (!videoRecorderRef.current) {
    videoRecorderRef.current = new CanvasVideoRecorder();
  }

  const [audioStatus, setAudioStatus] = useState<AudioStatusSnapshot>({
    sourceMode: 'none',
    trackName: '',
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    error: null,
  });
  const [audioVolume, setAudioVolume] = useState(0.85);
  const [audioBands, setAudioBands] = useState({ bass: 0, mid: 0, treble: 0 });

  const canvasRef = useRef<ParticleCanvasHandle | null>(null);
  const snapshotTimerRef = useRef<number | null>(null);
  const videoSavedTimerRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number>(0);

  const palette = getPaletteById(params.paletteId);
  const activeFlowOption =
    FLOW_MODE_OPTIONS.find((f) => f.id === params.flowMode) ?? FLOW_MODE_OPTIONS[0];
  const activeInteractionOption =
    INTERACTION_MODE_OPTIONS.find((m) => m.id === params.interactionMode) ??
    INTERACTION_MODE_OPTIONS[0];

  // Clean up audio engine & active video recorder on unmount
  useEffect(() => {
    const engine = audioEngineRef.current;
    const recorder = videoRecorderRef.current;
    return () => {
      recorder?.cancel();
      engine?.dispose();
      if (videoSavedTimerRef.current) {
        window.clearTimeout(videoSavedTimerRef.current);
      }
    };
  }, []);

  // Update elapsed recording duration cleanly at 4Hz while recording
  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => {
      setRecordingDurationMs(Math.max(0, performance.now() - recordingStartRef.current));
    }, 250);
    return () => window.clearInterval(id);
  }, [isRecording]);

  // Poll playback progress at 4Hz only while music is playing
  useEffect(() => {
    if (!audioStatus.isPlaying) return;
    const id = window.setInterval(() => {
      const engine = audioEngineRef.current;
      if (engine) {
        setAudioStatus(engine.getStatus());
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [audioStatus.isPlaying]);

  const handleUpdateParam = useCallback(
    <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => {
      setParams((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleChangeFlowMode = useCallback((flowMode: FlowMode) => {
    setParams((prev) => ({ ...prev, flowMode }));
  }, []);

  const handleChangeInteractionMode = useCallback((interactionMode: InteractionMode) => {
    setParams((prev) => ({ ...prev, interactionMode }));
  }, []);

  const handleChangePalette = useCallback((paletteId: PaletteId) => {
    setParams((prev) => ({ ...prev, paletteId }));
  }, []);

  const handlePulseTriggered = useCallback(() => {
    setPulseCount((c) => c + 1);
  }, []);

  const handleTriggerCenterPulse = useCallback(() => {
    canvasRef.current?.triggerCenterPulse();
  }, []);

  const handleResetCamera = useCallback(() => {
    canvasRef.current?.resetCamera();
  }, []);

  const handleResetDefaults = useCallback(() => {
    setParams((prev) => ({
      ...DEFAULT_SIMULATION_PARAMS,
      flowMode: prev.flowMode,
      paletteId: prev.paletteId,
      interactionMode: prev.interactionMode,
    }));
  }, []);

  const handleImportAudioFile = useCallback(async (file: File) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    setMusicOpen(true);
    setSlidersOpen(false);
    const status = await engine.loadLocalFile(file);
    setAudioStatus(status);
  }, []);

  const handleToggleDemoBeat = useCallback(() => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    const current = engine.getStatus();
    if (current.sourceMode === 'demo' && current.isPlaying) {
      setAudioStatus(engine.stop());
    } else {
      setAudioStatus(engine.startDemoBeat());
    }
  }, []);

  const handleToggleMusicPlay = useCallback(async () => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    const status = await engine.togglePlayPause();
    setAudioStatus(status);
  }, []);

  const handleSeekAudio = useCallback((seconds: number) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    engine.seek(seconds);
    setAudioStatus(engine.getStatus());
  }, []);

  const handleChangeVolume = useCallback((vol: number) => {
    setAudioVolume(vol);
    audioEngineRef.current?.setVolume(vol);
  }, []);

  const handleAudioBands = useCallback((bass: number, mid: number, treble: number) => {
    setAudioBands((prev) => {
      if (
        Math.abs(prev.bass - bass) < 0.015 &&
        Math.abs(prev.mid - mid) < 0.015 &&
        Math.abs(prev.treble - treble) < 0.015
      ) {
        return prev;
      }
      return { bass, mid, treble };
    });
  }, []);

  const handleCaptureSnapshot = useCallback(() => {
    const dataUrl = canvasRef.current?.captureSnapshot();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `particle-flow-${params.flowMode}-${Date.now()}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setSnapshotSaved(true);
    if (snapshotTimerRef.current) {
      window.clearTimeout(snapshotTimerRef.current);
    }
    snapshotTimerRef.current = window.setTimeout(() => {
      setSnapshotSaved(false);
    }, 1800);
  }, [params.flowMode]);

  const handleToggleRecording = useCallback(async () => {
    const recorder = videoRecorderRef.current;
    const engine = audioEngineRef.current;
    if (!recorder || !engine) return;

    setRecordingError(null);

    if (recorder.isRecording) {
      try {
        const result = await recorder.stop();
        setIsRecording(false);
        setRecordingDurationMs(0);
        setLastRecordingMeta({ bytes: result.sizeBytes, hasAudio: result.hasAudio });

        const url = URL.createObjectURL(result.blob);
        const link = document.createElement('a');
        link.download = buildRecordingFilename(params.flowMode, result.fileExt);
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);

        setVideoSaved(true);
        if (videoSavedTimerRef.current) {
          window.clearTimeout(videoSavedTimerRef.current);
        }
        videoSavedTimerRef.current = window.setTimeout(() => {
          setVideoSaved(false);
        }, 2000);
      } catch (err) {
        setIsRecording(false);
        setRecordingDurationMs(0);
        setRecordingError(err instanceof Error ? err.message : '导出视频失败，请重试');
      }
      return;
    }

    const canvas = canvasRef.current?.getCanvasElement();
    if (!canvas) {
      setRecordingError('画布尚未就绪，请稍后再试');
      return;
    }

    try {
      // Grab the persistent Web Audio MediaStream so local music or demo rhythm is recorded in sync
      const audioStream = engine.getRecordingAudioStream();
      recorder.start(canvas, audioStream, 60);
      recordingStartRef.current = performance.now();
      setRecordingDurationMs(0);
      setIsRecording(true);
    } catch (err) {
      setIsRecording(false);
      setRecordingError(err instanceof Error ? err.message : '无法启动视频录制');
    }
  }, [params.flowMode]);

  // Drag & drop local audio file anywhere on the viewport
  const handleDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (!isDragOverAudio) setIsDragOverAudio(true);
  }, [isDragOverAudio]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragOverAudio(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      setIsDragOverAudio(false);
      const file = Array.from(e.dataTransfer.files).find(
        (f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(f.name),
      );
      if (file) {
        void handleImportAudioFile(file);
      }
    },
    [handleImportAudioFile],
  );

  // Keyboard shortcuts: Space to pause/resume particles, H to toggle dock, 1-6 to switch scenes
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setParams((prev) => ({ ...prev, paused: !prev.paused }));
      } else if (e.key === 'h' || e.key === 'H') {
        setDockOpen((open) => !open);
      } else if (e.key >= '1' && e.key <= '6') {
        const idx = parseInt(e.key, 10) - 1;
        const option = FLOW_MODE_OPTIONS[idx];
        if (option) {
          setParams((prev) => ({ ...prev, flowMode: option.id }));
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (snapshotTimerRef.current) {
        window.clearTimeout(snapshotTimerRef.current);
      }
    };
  }, []);

  return (
    <main
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative w-screen h-screen overflow-hidden select-none"
      data-flow-mode={params.flowMode}
      data-interaction-mode={params.interactionMode}
      data-palette={params.paletteId}
      data-paused={String(params.paused)}
      data-dock-open={String(dockOpen)}
      data-sliders-open={String(slidersOpen)}
      data-music-open={String(musicOpen)}
      data-music-playing={String(audioStatus.isPlaying)}
      data-music-source={audioStatus.sourceMode}
      data-recording={String(isRecording)}
      data-last-recording-bytes={String(lastRecordingMeta.bytes)}
      data-last-recording-audio={String(lastRecordingMeta.hasAudio)}
      data-pulse-count={String(pulseCount)}
      style={{ backgroundColor: palette.backgroundHex }}
    >
      {/* Full-viewport interactive 3D floating particle WebGL scene */}
      <ParticleCanvas
        ref={canvasRef}
        params={params}
        audioEngine={audioEngineRef.current}
        onPulseTriggered={handlePulseTriggered}
        onAudioBands={handleAudioBands}
      />

      {/* Subtle drag-and-drop overlay when dragging a local audio file over the window */}
      {isDragOverAudio && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-6 z-30 rounded-2xl border-2 border-dashed flex items-center justify-center"
          style={{
            borderColor: palette.accentHex,
            backgroundColor: palette.isLight
              ? 'rgba(248, 245, 238, 0.84)'
              : 'rgba(11, 16, 29, 0.80)',
            color: palette.isLight ? '#0F172A' : '#F8FAFC',
          }}
        >
          <p className="text-base font-semibold tracking-wide">
            松开即可导入本地音乐并开启粒子律动
          </p>
        </div>
      )}

      {/* Minimal Top Header */}
      <TopBar
        palette={palette}
        flowLabel={activeFlowOption.label}
        interactionLabel={activeInteractionOption.label}
        dockOpen={dockOpen}
        onToggleDock={() => setDockOpen((v) => !v)}
        onResetCamera={handleResetCamera}
        onCaptureSnapshot={handleCaptureSnapshot}
        snapshotSaved={snapshotSaved}
        isRecording={isRecording}
        recordingDurationMs={recordingDurationMs}
        videoSaved={videoSaved}
        recordingError={recordingError}
        onToggleRecording={() => {
          void handleToggleRecording();
        }}
      />

      {/* Collapsible Unified Bottom Control Dock */}
      <ControlDock
        params={params}
        palette={palette}
        dockOpen={dockOpen}
        slidersOpen={slidersOpen}
        musicOpen={musicOpen}
        audioStatus={audioStatus}
        audioBands={audioBands}
        audioVolume={audioVolume}
        onToggleDock={() => setDockOpen((v) => !v)}
        onToggleSliders={() => {
          setSlidersOpen((v) => !v);
          setMusicOpen(false);
        }}
        onToggleMusic={() => {
          setMusicOpen((v) => !v);
          setSlidersOpen(false);
        }}
        onChangeFlowMode={handleChangeFlowMode}
        onChangeInteractionMode={handleChangeInteractionMode}
        onChangePalette={handleChangePalette}
        onUpdateParam={handleUpdateParam}
        onTriggerPulse={handleTriggerCenterPulse}
        onResetDefaults={handleResetDefaults}
        onImportAudioFile={(file) => {
          void handleImportAudioFile(file);
        }}
        onToggleDemoBeat={handleToggleDemoBeat}
        onToggleMusicPlay={() => {
          void handleToggleMusicPlay();
        }}
        onSeekAudio={handleSeekAudio}
        onChangeVolume={handleChangeVolume}
      />
    </main>
  );
}
