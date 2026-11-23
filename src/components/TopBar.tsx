import { Camera, Compass, Eye, EyeOff } from 'lucide-react';
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
}: TopBarProps) {
  const isLight = palette.isLight;

  const textPrimary = isLight ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLight ? 'text-slate-600' : 'text-slate-400';
  const surfaceBtn = isLight
    ? 'bg-[#F8F5EE]/90 border-slate-900/12 text-slate-800 hover:bg-white'
    : 'bg-[#0C111E]/84 border-white/12 text-slate-100 hover:bg-[#151D30]/92';

  const scrimStyle = {
    backgroundImage: isLight
      ? 'linear-gradient(to bottom, rgba(243, 239, 230, 0.82) 0%, rgba(243, 239, 230, 0.35) 60%, rgba(243, 239, 230, 0) 100%)'
      : 'linear-gradient(to bottom, rgba(6, 9, 19, 0.78) 0%, rgba(6, 9, 19, 0.32) 60%, rgba(6, 9, 19, 0) 100%)',
  };

  return (
    <header
      style={scrimStyle}
      className="pointer-events-none fixed top-0 left-0 right-0 z-20 flex items-center justify-between gap-4 px-4 py-3.5 sm:px-7 sm:py-5"
    >
      {/* Zone 1: Clean single-line brand wordmark */}
      <div className="pointer-events-auto flex items-baseline gap-3 min-w-0">
        <h1
          className={`text-lg sm:text-xl font-semibold tracking-tight whitespace-nowrap shrink-0 transition-colors duration-300 ${textPrimary}`}
        >
          流光粒子
        </h1>
        <span
          className={`hidden md:inline text-xs font-normal whitespace-nowrap truncate transition-colors duration-300 ${textMuted}`}
        >
          {flowLabel} · {interactionLabel}交互 · 移动搅动 / 点击脉冲 / 右键旋转
        </span>
      </div>

      {/* Zone 2: Minimal unobtrusive utility actions (no backdrop-filter over WebGL) */}
      <div className="pointer-events-auto flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onResetCamera}
          aria-label="重置视角"
          title="重置视角"
          className={`inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg border text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${surfaceBtn}`}
        >
          <Compass className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">重置视角</span>
        </button>

        <button
          type="button"
          onClick={onCaptureSnapshot}
          aria-label="保存当前画面为图片"
          className={`inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-lg border text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${surfaceBtn}`}
        >
          <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{snapshotSaved ? '已保存' : '保存画面'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleDock}
          aria-label={dockOpen ? '隐藏底部控制栏进入沉浸模式' : '展开底部控制栏'}
          aria-expanded={dockOpen}
          className={`inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-lg border text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${surfaceBtn}`}
        >
          {dockOpen ? (
            <>
              <EyeOff className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">沉浸模式</span>
            </>
          ) : (
            <>
              <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>展开控制</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
