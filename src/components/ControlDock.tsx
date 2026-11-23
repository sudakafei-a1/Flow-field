import { useRef, type ChangeEvent, type CSSProperties } from 'react';
import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  Music,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Upload,
  Volume2,
  Waves,
} from 'lucide-react';
import type { AudioStatusSnapshot } from '../audio/audioEngine';
import { formatAudioTime } from '../audio/audioMetrics';
import { PALETTES } from '../simulation/palettes';
import {
  FLOW_MODE_OPTIONS,
  INTERACTION_MODE_OPTIONS,
  MAX_PARTICLES,
  MIN_PARTICLES,
  type FlowMode,
  type InteractionMode,
  type PaletteConfig,
  type PaletteId,
  type SimulationParams,
} from '../simulation/types';

interface ControlDockProps {
  params: SimulationParams;
  palette: PaletteConfig;
  dockOpen: boolean;
  slidersOpen: boolean;
  musicOpen: boolean;
  audioStatus: AudioStatusSnapshot;
  audioBands: { bass: number; mid: number; treble: number };
  audioVolume: number;
  onToggleDock: () => void;
  onToggleSliders: () => void;
  onToggleMusic: () => void;
  onChangeFlowMode: (mode: FlowMode) => void;
  onChangeInteractionMode: (mode: InteractionMode) => void;
  onChangePalette: (id: PaletteId) => void;
  onUpdateParam: <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => void;
  onTriggerPulse: () => void;
  onResetDefaults: () => void;
  onImportAudioFile: (file: File) => void;
  onToggleDemoBeat: () => void;
  onToggleMusicPlay: () => void;
  onSeekAudio: (seconds: number) => void;
  onChangeVolume: (volume: number) => void;
}

export function ControlDock({
  params,
  palette,
  dockOpen,
  slidersOpen,
  musicOpen,
  audioStatus,
  audioBands,
  audioVolume,
  onToggleDock,
  onToggleSliders,
  onToggleMusic,
  onChangeFlowMode,
  onChangeInteractionMode,
  onChangePalette,
  onUpdateParam,
  onTriggerPulse,
  onResetDefaults,
  onImportAudioFile,
  onToggleDemoBeat,
  onToggleMusicPlay,
  onSeekAudio,
  onChangeVolume,
}: ControlDockProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isLight = palette.isLight;

  // Solid high-contrast rgba surfaces (NO backdrop-filter over WebGL per 3D performance rules)
  const dockSurface = isLight
    ? 'bg-[#F8F5EE]/94 border-slate-900/12 text-slate-900 shadow-[0_12px_36px_rgba(15,23,42,0.12)]'
    : 'bg-[#0B101D]/90 border-white/12 text-slate-100 shadow-[0_14px_40px_rgba(0,0,0,0.55)]';

  const groupBg = isLight ? 'bg-slate-900/[0.05]' : 'bg-white/[0.06]';
  const dividerBorder = isLight ? 'border-slate-900/10' : 'border-white/10';
  const mutedText = isLight ? 'text-slate-600' : 'text-slate-400';

  const activeSegClass = isLight
    ? 'bg-slate-900 text-white shadow-sm'
    : 'bg-white text-slate-950 shadow-sm';
  const idleSegClass = isLight
    ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-900/5'
    : 'text-slate-300 hover:text-white hover:bg-white/8';

  const iconBtnClass = isLight
    ? 'bg-slate-900/[0.05] text-slate-800 hover:bg-slate-900/[0.11] border-slate-900/10'
    : 'bg-white/[0.06] text-slate-200 hover:bg-white/[0.13] border-white/10';

  const activeIconBtnClass = isLight
    ? 'bg-slate-900 text-white border-slate-900'
    : 'bg-white text-slate-950 border-white';

  const sliderTrackColor = isLight ? 'rgba(15, 23, 42, 0.16)' : 'rgba(255, 255, 255, 0.18)';
  const thumbRingColor = isLight ? '#F8F5EE' : '#0B101D';

  const makeSliderStyle = (percent: number): CSSProperties =>
    ({
      '--slider-accent': palette.accentHex,
      '--slider-thumb-ring': thumbRingColor,
      backgroundImage: `linear-gradient(to right, ${palette.accentHex} ${Math.max(0, Math.min(100, percent))}%, ${sliderTrackColor} ${Math.max(0, Math.min(100, percent))}%)`,
      backgroundSize: '100% 4px',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
    }) as CSSProperties;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportAudioFile(file);
    }
    e.target.value = '';
  };

  const progressPercent =
    audioStatus.duration > 0 ? (audioStatus.currentTime / audioStatus.duration) * 100 : 0;

  return (
    <section
      aria-label="粒子流场控制面板"
      className="pointer-events-none fixed bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-20 w-[min(980px,calc(100vw-20px))] flex flex-col items-center"
    >
      {/* Hidden native local audio file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        aria-label="选择本地音乐文件"
        className="sr-only"
      />

      {/* Collapsed state restore button */}
      {!dockOpen && (
        <button
          type="button"
          onClick={onToggleDock}
          aria-label="展开流场控制栏"
          className={`pointer-events-auto inline-flex items-center gap-2 h-10 px-4 rounded-xl border text-xs font-medium transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${dockSurface}`}
        >
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
          <span>展开流场控制</span>
        </button>
      )}

      {/* Expanded Unified Bottom Dock */}
      {dockOpen && (
        <div className="pointer-events-auto w-full flex flex-col items-center">
          {/* Compact Collapse Handle attached cleanly to top edge */}
          <button
            type="button"
            onClick={onToggleDock}
            aria-label="收起底部控制栏"
            className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-t-lg border border-b-0 text-[11px] font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${dockSurface}`}
          >
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>收起控制</span>
          </button>

          {/* Main Dock Container */}
          <div className={`w-full rounded-2xl border overflow-hidden transition-colors duration-300 ${dockSurface}`}>
            {/* Expandable Music Reactivity & Local Import Drawer */}
            {musicOpen && (
              <div className={`px-4 py-3.5 sm:px-5 sm:py-4 border-b ${dividerBorder}`}>
                <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-semibold tracking-wide whitespace-nowrap">
                      音乐律动与本地导入
                    </span>
                    {audioStatus.trackName ? (
                      <span className={`text-xs truncate max-w-[220px] sm:max-w-[320px] ${mutedText}`}>
                        {audioStatus.trackName}
                      </span>
                    ) : (
                      <span className={`text-xs truncate ${mutedText}`}>
                        支持 MP3 / WAV / OGG / FLAC，或拖放音频到画面
                      </span>
                    )}
                  </div>

                  {/* Spectrum Band Visualizer (static geometric bars driven by live FFT) */}
                  <div
                    aria-label="实时频段响应"
                    className="flex items-end gap-1 h-4 shrink-0"
                    title="低频 / 中频 / 高频实时能量"
                  >
                    {[
                      audioBands.bass,
                      (audioBands.bass + audioBands.mid) * 0.5,
                      audioBands.mid,
                      (audioBands.mid + audioBands.treble) * 0.5,
                      audioBands.treble,
                    ].map((lvl, idx) => (
                      <span
                        key={idx}
                        aria-hidden="true"
                        className="w-1 rounded-sm transition-transform duration-75 origin-bottom"
                        style={{
                          height: '16px',
                          backgroundColor: palette.accentHex,
                          opacity: audioStatus.isPlaying ? 0.92 : 0.25,
                          transform: `scaleY(${Math.max(0.18, Math.min(1, lvl * params.musicSensitivity))})`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Left: Import Local Audio, Demo Beat, Play/Pause */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400 ${iconBtnClass}`}
                    >
                      <Upload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>导入本地音乐</span>
                    </button>

                    <button
                      type="button"
                      onClick={onToggleDemoBeat}
                      aria-pressed={audioStatus.sourceMode === 'demo' && audioStatus.isPlaying}
                      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400 ${
                        audioStatus.sourceMode === 'demo' && audioStatus.isPlaying
                          ? activeIconBtnClass
                          : iconBtnClass
                      }`}
                    >
                      <AudioLines className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {audioStatus.sourceMode === 'demo' && audioStatus.isPlaying
                          ? '停止节拍'
                          : '试听节拍'}
                      </span>
                    </button>

                    {audioStatus.sourceMode !== 'none' && (
                      <button
                        type="button"
                        onClick={onToggleMusicPlay}
                        aria-label={audioStatus.isPlaying ? '暂停音乐' : '播放音乐'}
                        className={`inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400 ${
                          audioStatus.isPlaying ? activeIconBtnClass : iconBtnClass
                        }`}
                      >
                        {audioStatus.isPlaying ? (
                          <>
                            <Pause className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>暂停</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>播放</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Right: Local Track Progress (when loaded), Sensitivity & Volume */}
                  <div className="flex flex-wrap items-center gap-4 flex-1 justify-end min-w-[240px]">
                    {audioStatus.sourceMode === 'file' && audioStatus.duration > 0 && (
                      <label className="flex items-center gap-2 min-w-[160px] flex-1 max-w-[220px]">
                        <span className={`font-mono-tabular text-[11px] shrink-0 ${mutedText}`}>
                          {formatAudioTime(audioStatus.currentTime)}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={audioStatus.duration}
                          step={0.5}
                          value={audioStatus.currentTime}
                          onChange={(e) => onSeekAudio(parseFloat(e.target.value))}
                          aria-label="音乐播放进度"
                          className="particle-slider w-full h-5"
                          style={makeSliderStyle(progressPercent)}
                        />
                        <span className={`font-mono-tabular text-[11px] shrink-0 ${mutedText}`}>
                          {formatAudioTime(audioStatus.duration)}
                        </span>
                      </label>
                    )}

                    <label className="flex items-center gap-2 w-36 shrink-0">
                      <span className={`text-xs whitespace-nowrap shrink-0 ${mutedText}`}>
                        脉动强度
                      </span>
                      <input
                        type="range"
                        min={0.4}
                        max={2.2}
                        step={0.05}
                        value={params.musicSensitivity}
                        onChange={(e) =>
                          onUpdateParam('musicSensitivity', parseFloat(e.target.value))
                        }
                        aria-label="音乐脉动强度"
                        className="particle-slider w-full h-5"
                        style={makeSliderStyle(((params.musicSensitivity - 0.4) / 1.8) * 100)}
                      />
                    </label>

                    <label className="flex items-center gap-1.5 w-24 shrink-0">
                      <Volume2 className={`w-3.5 h-3.5 shrink-0 ${mutedText}`} aria-hidden="true" />
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={audioVolume}
                        onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
                        aria-label="音乐音量"
                        className="particle-slider w-full h-5"
                        style={makeSliderStyle(audioVolume * 100)}
                      />
                    </label>
                  </div>
                </div>

                {audioStatus.error && (
                  <p role="alert" className="mt-2 text-xs text-rose-400">
                    {audioStatus.error}
                  </p>
                )}
              </div>
            )}

            {/* Optional Expandable Parameter Sliders Drawer */}
            {slidersOpen && (
              <div className={`px-4 py-3.5 sm:px-5 sm:py-4 border-b ${dividerBorder}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold tracking-wide">精细流体参数</span>
                  <button
                    type="button"
                    onClick={onResetDefaults}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${mutedText} hover:opacity-100`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>恢复默认</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Flow Speed */}
                  <label className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className={mutedText}>流动速度</span>
                      <span className="font-mono-tabular font-medium">
                        {params.flowSpeed.toFixed(1)}×
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={2.4}
                      step={0.1}
                      value={params.flowSpeed}
                      onChange={(e) => onUpdateParam('flowSpeed', parseFloat(e.target.value))}
                      aria-label="流动速度"
                      className="particle-slider w-full h-5"
                      style={makeSliderStyle(((params.flowSpeed - 0.2) / 2.2) * 100)}
                    />
                  </label>

                  {/* Particle Count */}
                  <label className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className={mutedText}>粒子数量</span>
                      <span className="font-mono-tabular font-medium">
                        {params.particleCount.toLocaleString()}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={MIN_PARTICLES}
                      max={MAX_PARTICLES}
                      step={200}
                      value={params.particleCount}
                      onChange={(e) => onUpdateParam('particleCount', parseInt(e.target.value, 10))}
                      aria-label="粒子数量"
                      className="particle-slider w-full h-5"
                      style={makeSliderStyle(
                        ((params.particleCount - MIN_PARTICLES) / (MAX_PARTICLES - MIN_PARTICLES)) *
                          100,
                      )}
                    />
                  </label>

                  {/* Turbulence */}
                  <label className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className={mutedText}>湍流强度</span>
                      <span className="font-mono-tabular font-medium">
                        {params.turbulence.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={2.0}
                      step={0.1}
                      value={params.turbulence}
                      onChange={(e) => onUpdateParam('turbulence', parseFloat(e.target.value))}
                      aria-label="湍流强度"
                      className="particle-slider w-full h-5"
                      style={makeSliderStyle(((params.turbulence - 0.2) / 1.8) * 100)}
                    />
                  </label>

                  {/* Interaction Radius */}
                  <label className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className={mutedText}>交互半径</span>
                      <span className="font-mono-tabular font-medium">
                        {params.interactionRadius.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1.6}
                      max={6.0}
                      step={0.2}
                      value={params.interactionRadius}
                      onChange={(e) =>
                        onUpdateParam('interactionRadius', parseFloat(e.target.value))
                      }
                      aria-label="交互半径"
                      className="particle-slider w-full h-5"
                      style={makeSliderStyle(((params.interactionRadius - 1.6) / 4.4) * 100)}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Primary Compact Control Strip */}
            <div className="px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col gap-2.5">
              {/* Row 1: Flow Presets + Quick Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Flow Mode Segmented Control (3x2 grid on mobile, single row on desktop) */}
                <div
                  role="group"
                  aria-label="流场形态选择"
                  className={`grid grid-cols-3 sm:flex items-center gap-1 p-1 rounded-xl w-full sm:w-auto ${groupBg}`}
                >
                  {FLOW_MODE_OPTIONS.map((option) => {
                    const active = params.flowMode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onChangeFlowMode(option.id)}
                        aria-pressed={active}
                        title={option.shortDesc}
                        className={`px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-medium rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 text-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400 ${
                          active ? activeSegClass : idleSegClass
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {/* Right-side Primary Interactive Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onTriggerPulse}
                    aria-label="释放中心粒子脉冲波"
                    title="释放中心脉冲波"
                    className={`inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-lg border text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400 ${iconBtnClass}`}
                  >
                    <Waves className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>脉冲</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateParam('paused', !params.paused)}
                    aria-label={params.paused ? '继续粒子流动' : '暂停粒子流动'}
                    aria-pressed={params.paused}
                    title={params.paused ? '继续 (空格键)' : '暂停 (空格键)'}
                    className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border transition-colors duration-150 shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400 ${
                      params.paused ? activeIconBtnClass : iconBtnClass
                    }`}
                  >
                    {params.paused ? (
                      <Play className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Pause className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateParam('autoOrbit', !params.autoOrbit)}
                    aria-label={params.autoOrbit ? '关闭自动环绕视角' : '开启自动环绕视角'}
                    aria-pressed={params.autoOrbit}
                    title={params.autoOrbit ? '自动环绕：开' : '自动环绕：关'}
                    className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border transition-colors duration-150 shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400 ${
                      params.autoOrbit ? activeIconBtnClass : iconBtnClass
                    }`}
                  >
                    <Orbit className="w-4 h-4" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={onToggleMusic}
                    aria-label={musicOpen ? '收起音乐律动面板' : '展开音乐律动与本地音乐导入'}
                    aria-expanded={musicOpen}
                    className={`inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-lg border text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400 ${
                      musicOpen || audioStatus.isPlaying ? activeIconBtnClass : iconBtnClass
                    }`}
                  >
                    <Music className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{audioStatus.isPlaying ? '律动中' : '音乐律动'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleSliders}
                    aria-label={slidersOpen ? '收起精细参数面板' : '展开精细参数面板'}
                    aria-expanded={slidersOpen}
                    className={`inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-lg border text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400 ${
                      slidersOpen ? activeIconBtnClass : iconBtnClass
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>参数</span>
                  </button>
                </div>
              </div>

              {/* Row 2: Interaction Force Mode + Curated Palette Swatches */}
              <div className={`pt-2.5 border-t ${dividerBorder} flex flex-wrap items-center justify-between gap-3`}>
                {/* Interaction Force Selector */}
                <div className="flex items-center gap-2.5">
                  <span className={`text-xs whitespace-nowrap shrink-0 ${mutedText}`}>交互方式</span>
                  <div
                    role="group"
                    aria-label="鼠标交互力场模式"
                    className={`flex items-center gap-1 p-0.5 rounded-lg ${groupBg}`}
                  >
                    {INTERACTION_MODE_OPTIONS.map((option) => {
                      const active = params.interactionMode === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onChangeInteractionMode(option.id)}
                          aria-pressed={active}
                          title={option.hint}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400 ${
                            active ? activeSegClass : idleSegClass
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color Palette Swatches */}
                <div className="flex items-center gap-2.5">
                  <span className={`text-xs whitespace-nowrap shrink-0 ${mutedText}`}>色彩主题</span>
                  <div role="group" aria-label="粒子色彩主题" className="flex items-center gap-1.5">
                    {PALETTES.map((p) => {
                      const selected = params.paletteId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onChangePalette(p.id)}
                          aria-label={`切换配色：${p.name}`}
                          aria-pressed={selected}
                          title={p.name}
                          className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-lg border text-xs font-medium transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400 ${
                            selected
                              ? isLight
                                ? 'border-slate-900 bg-slate-900/10 text-slate-950'
                                : 'border-white/75 bg-white/14 text-white'
                              : isLight
                                ? 'border-slate-900/10 hover:border-slate-900/30 text-slate-700'
                                : 'border-white/10 hover:border-white/30 text-slate-300'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className="w-3 h-3 rounded-full shrink-0 border border-black/15"
                            style={{ background: p.swatchGradient }}
                          />
                          <span className="hidden md:inline">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
