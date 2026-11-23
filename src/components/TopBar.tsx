import { Camera, Compass, Eye, EyeOff, Square, Video } from 'lucide-react';
import { formatRecordingDuration } from '../recording/videoRecorder';
import type { PaletteConfig } from '../simulation/types';

interface TopBarProps {
  palette: PaletteConfig;
  flowLabel: string;
  interactionLabel: string;
  dockOpen: boolean;
  onToggleDock: () => void;
  onResetCamera: () => void;
  onCaptureSnapshot: () => void;
  snapshotSaved: boolean;
  isRecording: boolean;
  recordingDurationMs: number;
  videoSaved: boolean;
  recordingError: string | null;
  onToggleRecording: () => void;
}

export function TopBar({
  palette,
  flowLabel,
  interactionLabel,
  dockOpen,
  onToggleDock,
  onResetCamera,
  onCaptureSnapshot,
  snapshotSaved,
  isRecording,
  recordingDurationMs,
  videoSaved,
  recordingError,
  onToggleRecording,
}: TopBarProps) {
  const isLight = palette.isLight;

  const textPrimary = isLight ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLight ? 'text-slate-600' : 'text-slate-400';
  const surfaceBtn = isLight
    ? 'bg-[#F8F5EE]/90 border-slate-900/12 text-slate-800 hover:bg-white'
    : 'bg-[#0C111E]/84 border-white/12 text-slate-100 hover:bg-[#151D30]/92';
  const recordingActiveBtn = isLight
    ? 'bg-rose-600 border-rose-700 text-white hover:bg-rose-700'
    : 'bg-rose-600/92 border-rose-400/50 text-white hover:bg-rose-500';

  const scrimStyle = {
    backgroundImage: isLight
      ? 'linear-gradient(to bottom, rgba(243, 239, 230, 0.82) 0%, rgba(243, 239, 230, 0.35) 60%, rgba(243, 239, 230, 0) 100%)'
      : 'linear-gradient(to bottom, rgba(6, 9, 19, 0.78) 0%, rgba(6, 9, 19, 0.32) 60%, rgba(6, 9, 19, 0) 100%)',
  };

  return (
    <header
      style={scrimStyle}
      className="pointer-events-none fixed top-0 left-0 right-0 z-20 flex flex-col gap-2 px-4 py-3.5 sm:px-7 sm:py-5"
    >
      <div className="flex items-center justify-between gap-3">
        {/* Zone 1: Clean single-line brand wordmark */}
        <div className="pointer-events-auto flex items-baseline gap-3 min-w-0">
          <h1
            className={`text-lg sm:text-xl font-semibold tracking-tight whitespace-nowrap shrink-0 transition-colors duration-300 ${textPrimary}`}
          >
            流光粒子
          </h1>
          <span
            className={`hidden lg:inline text-xs font-normal whitespace-nowrap truncate transition-colors duration-300 ${textMuted}`}
          >
            {flowLabel} · {interactionLabel}交互 · 移动搅动 / 点击脉冲 / 右键旋转
          </span>
        </div>

        {/* Zone 2: Minimal unobtrusive utility actions (no backdrop-filter over WebGL) */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onResetCamera}
            aria-label="重置视角"
            title="重置视角"
            className={`inline-flex items-center justify-center gap-1.5 h-10 px-2.5 sm:px-3 rounded-lg border text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${surfaceBtn}`}
          >
            <Compass className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden md:inline">重置视角</span>
          </button>

          <button
            type="button"
            onClick={onToggleRecording}
            aria-label={isRecording ? '停止录制并导出视频' : '一键录制动态视频（含音乐律动声音）'}
            aria-pressed={isRecording}
            title={isRecording ? '停止录制并保存到本地' : '一键录制动态视频（同步录制音乐声音）'}
            className={`inline-flex items-center justify-center gap-1.5 h-10 px-3 sm:px-3.5 rounded-lg border text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
              isRecording ? recordingActiveBtn : surfaceBtn
            }`}
          >
            {isRecording ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current shrink-0" aria-hidden="true" />
                <span className="font-mono-tabular">
                  停止 {formatRecordingDuration(recordingDurationMs)}
                </span>
              </>
            ) : (
              <>
                <Video className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{videoSaved ? '已导出' : '录制视频'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onCaptureSnapshot}
            aria-label="保存当前画面为图片"
            title="保存当前画面为 PNG 图片"
            className={`inline-flex items-center justify-center gap-1.5 h-10 px-2.5 sm:px-3.5 rounded-lg border text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${surfaceBtn}`}
          >
            <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">{snapshotSaved ? '已保存' : '保存画面'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleDock}
            aria-label={dockOpen ? '隐藏底部控制栏进入沉浸模式' : '展开底部控制栏'}
            aria-expanded={dockOpen}
            className={`inline-flex items-center justify-center gap-1.5 h-10 px-2.5 sm:px-3.5 rounded-lg border text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${surfaceBtn}`}
          >
            {dockOpen ? (
              <>
                <EyeOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="hidden md:inline">沉浸模式</span>
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>展开控制</span>
              </>
            )}
          </button>
        </div>
      </div>

      {recordingError && (
        <div
          role="alert"
          className="pointer-events-auto self-end px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-950/90 text-rose-100 text-xs"
        >
          {recordingError}
        </div>
      )}
    </header>
  );
}
