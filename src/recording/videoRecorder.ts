export interface SelectedCodec {
  mimeType: string;
  fileExt: 'webm' | 'mp4';
}

export interface RecordedVideoResult {
  blob: Blob;
  mimeType: string;
  fileExt: 'webm' | 'mp4';
  durationMs: number;
  sizeBytes: number;
  hasAudio: boolean;
}

const PREFERRED_CODECS_WITH_AUDIO: ReadonlyArray<SelectedCodec> = [
  { mimeType: 'video/webm;codecs=vp9,opus', fileExt: 'webm' },
  { mimeType: 'video/webm;codecs=vp8,opus', fileExt: 'webm' },
  { mimeType: 'video/webm;codecs=h264,opus', fileExt: 'webm' },
  { mimeType: 'video/webm', fileExt: 'webm' },
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', fileExt: 'mp4' },
  { mimeType: 'video/mp4', fileExt: 'mp4' },
];

const PREFERRED_CODECS_VIDEO_ONLY: ReadonlyArray<SelectedCodec> = [
  { mimeType: 'video/webm;codecs=vp9', fileExt: 'webm' },
  { mimeType: 'video/webm;codecs=vp8', fileExt: 'webm' },
  { mimeType: 'video/webm', fileExt: 'webm' },
  { mimeType: 'video/mp4', fileExt: 'mp4' },
];

/**
 * Pure codec selector choosing the most compatible container & audio/video codec
 * supported by the current browser's MediaRecorder implementation.
 */
export function selectBestVideoMimeType(
  isTypeSupported: (mime: string) => boolean,
  hasAudio: boolean,
): SelectedCodec | null {
  const candidates = hasAudio ? PREFERRED_CODECS_WITH_AUDIO : PREFERRED_CODECS_VIDEO_ONLY;
  for (const candidate of candidates) {
    if (isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Formats recording duration in milliseconds as MM:SS.
 */
export function formatRecordingDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '00:00';
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Builds a clean, safe local download filename for recorded particle videos.
 */
export function buildRecordingFilename(
  flowMode: string,
  fileExt: 'webm' | 'mp4',
  timestamp = Date.now(),
): string {
  const safeMode = flowMode.replace(/[^a-zA-Z0-9_-]/g, '') || 'scene';
  return `particle-flow-${safeMode}-${timestamp}.${fileExt}`;
}

/**
 * Synchronized WebGL Canvas + Web Audio MediaRecorder controller.
 * Captures canvas video frames at up to 60fps muxed with live Web Audio tracks
 * (both imported local music and built-in rhythm synth).
 */
export class CanvasVideoRecorder {
  private recorder: MediaRecorder | null = null;
  private videoStream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private hasAudio = false;
  private selectedCodec: SelectedCodec = { mimeType: 'video/webm', fileExt: 'webm' };
  private stopResolver: ((result: RecordedVideoResult) => void) | null = null;
  private stopRejecter: ((err: Error) => void) | null = null;

  get isRecording(): boolean {
    return this.recorder !== null && this.recorder.state === 'recording';
  }

  start(canvas: HTMLCanvasElement, audioStream: MediaStream | null, fps = 60): void {
    if (this.isRecording) return;

    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      throw new Error('当前浏览器不支持画布视频录制功能');
    }

    const videoStream = canvas.captureStream(fps);
    const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];

    const audioTracks = audioStream ? audioStream.getAudioTracks().filter((t) => t.readyState === 'live') : [];
    for (const track of audioTracks) {
      tracks.push(track);
    }

    const hasAudio = audioTracks.length > 0;
    const isSupported =
      typeof MediaRecorder.isTypeSupported === 'function'
        ? (mime: string) => MediaRecorder.isTypeSupported(mime)
        : () => false;

    const codec = selectBestVideoMimeType(isSupported, hasAudio) ?? {
      mimeType: '',
      fileExt: 'webm' as const,
    };

    const combinedStream = new MediaStream(tracks);
    const options: MediaRecorderOptions = {
      videoBitsPerSecond: 8_000_000,
      audioBitsPerSecond: 192_000,
    };
    if (codec.mimeType) {
      options.mimeType = codec.mimeType;
    }

    const recorder = new MediaRecorder(combinedStream, options);

    this.videoStream = videoStream;
    this.recorder = recorder;
    this.chunks = [];
    this.startedAt = performance.now();
    this.hasAudio = hasAudio;
    this.selectedCodec = codec.mimeType
      ? codec
      : {
          mimeType: recorder.mimeType || 'video/webm',
          fileExt: (recorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm',
        };

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      const durationMs = Math.max(0, performance.now() - this.startedAt);
      const mimeType = this.selectedCodec.mimeType || 'video/webm';
      const blob = new Blob(this.chunks, { type: mimeType });
      const result: RecordedVideoResult = {
        blob,
        mimeType,
        fileExt: this.selectedCodec.fileExt,
        durationMs,
        sizeBytes: blob.size,
        hasAudio: this.hasAudio,
      };
      this.cleanupStreams();
      const resolve = this.stopResolver;
      this.stopResolver = null;
      this.stopRejecter = null;
      resolve?.(result);
    };

    recorder.onerror = () => {
      this.cleanupStreams();
      const reject = this.stopRejecter;
      this.stopResolver = null;
      this.stopRejecter = null;
      reject?.(new Error('视频录制过程中发生编码错误'));
    };

    // Flush chunks every 250ms for smooth memory behavior and instant finalization
    recorder.start(250);
  }

  stop(): Promise<RecordedVideoResult> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state === 'inactive') {
        reject(new Error('当前未在录制视频'));
        return;
      }
      this.stopResolver = resolve;
      this.stopRejecter = reject;
      try {
        this.recorder.stop();
      } catch (err) {
        this.cleanupStreams();
        this.stopResolver = null;
        this.stopRejecter = null;
        reject(err instanceof Error ? err : new Error('停止录制失败'));
      }
    });
  }

  cancel(): void {
    this.stopResolver = null;
    this.stopRejecter = null;
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        // Ignore teardown errors
      }
    }
    this.cleanupStreams();
  }

  private cleanupStreams(): void {
    // Only stop the captured canvas video tracks; leave audioEngine's persistent audio tracks live
    if (this.videoStream) {
      for (const track of this.videoStream.getTracks()) {
        track.stop();
      }
      this.videoStream = null;
    }
    this.recorder = null;
    this.chunks = [];
  }
}
