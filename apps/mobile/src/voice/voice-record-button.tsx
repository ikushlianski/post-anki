import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity } from "react-native";
import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from "expo-audio";
import { File } from "expo-file-system";
import { transcribeAudio } from "./voice-api";

// Must track VOICE_NOTE_RECORDING_OPTIONS.web.mimeType below — web records
// to webm, not m4a, while native records to m4a on both iOS and Android.
const AUDIO_MIME_TYPE = Platform.OS === "web" ? "audio/webm" : "audio/m4a";
// Built from RecordingPresets.HIGH_QUALITY rather than LOW_QUALITY: that
// preset's Android variant switches container to .3gp/amr_nb, which would
// silently break the fixed "audio/m4a" mimeType above on Android. This
// forces the same m4a/AAC container on both platforms, just at a lower
// bitrate/mono channel count so a full recording still fits comfortably
// under the backend's 1MB request-body cap (apps/api/src/shared/http.ts).
const VOICE_NOTE_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: {
    outputFormat: "mpeg4",
    audioEncoder: "aac",
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 64000,
  },
};
const MAX_RECORDING_MS = 60_000;

type RecordingState = "idle" | "recording" | "transcribing";

export function VoiceRecordButton({
  disabled,
  onTranscribed,
  onError,
  onBusyChange,
}: {
  disabled?: boolean;
  onTranscribed: (text: string) => void;
  onError: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const stoppingRef = useRef(false);
  const recorder = useAudioRecorder(VOICE_NOTE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [state, setStateRaw] = useState<RecordingState>("idle");

  function setState(next: RecordingState) {
    setStateRaw(next);
    onBusyChange?.(next !== "idle");
  }

  useEffect(() => {
    if (
      recorderState.isRecording &&
      recorderState.durationMillis >= MAX_RECORDING_MS &&
      !stoppingRef.current
    ) {
      void stopRecording();
    }
  }, [recorderState.isRecording, recorderState.durationMillis]);

  async function startRecording() {
    const permission = await AudioModule.requestRecordingPermissionsAsync();

    if (!permission.granted) {
      onError("Microphone access is required to record a voice note.");
      return;
    }

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setState("recording");
  }

  async function stopRecording() {
    if (stoppingRef.current) {
      return;
    }

    stoppingRef.current = true;
    setState("transcribing");

    let recordedFile: File | null = null;

    try {
      await recorder.stop();

      if (!recorder.uri) {
        throw new Error("no recording produced");
      }

      recordedFile = new File(recorder.uri);
      const audioBase64 = await recordedFile.base64();
      const { text } = await transcribeAudio({ audioBase64, mimeType: AUDIO_MIME_TYPE });

      onTranscribed(text);
    } catch {
      onError("Couldn't transcribe that voice note — try again.");
    } finally {
      // Runs after the outcome above is already decided, so a delete
      // failure can never mask a transcription result.
      try {
        recordedFile?.delete();
      } catch {
        // best-effort cleanup only
      }

      stoppingRef.current = false;
      setState("idle");
    }
  }

  const seconds = Math.floor(recorderState.durationMillis / 1000);
  const label =
    state === "recording"
      ? `⏹ Stop (${seconds}s)`
      : state === "transcribing"
        ? "Transcribing…"
        : "🎤 Voice note";

  return (
    <TouchableOpacity
      disabled={disabled || state === "transcribing"}
      style={[styles.button, state === "recording" && styles.recording, disabled && styles.disabled]}
      onPress={state === "recording" ? stopRecording : startRecording}
    >
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  recording: {
    borderColor: "#dc2626",
    backgroundColor: "#fef2f2",
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 14,
    color: "#111",
    fontWeight: "600",
  },
});
