import { useRef, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { verifyToken } from "../src/api/client";
import { consumeClearReason, setStoredToken } from "../src/api/token-storage";

export default function ConnectScreen() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearReason] = useState(() => consumeClearReason());
  // setBusy(true) alone doesn't guard against a genuine double-tap: two
  // native click events dispatched in the same synchronous tick both read
  // the pre-update `busy` state, since React state updates aren't applied
  // until the next render. Same pattern already fixed in the Today and
  // practice screens' submit handlers.
  const busyRef = useRef(false);

  async function connect() {
    const trimmed = token.trim();

    if (trimmed.length === 0) {
      setError("Paste a token first.");
      return;
    }

    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const ok = await verifyToken(trimmed);

      if (!ok) {
        setError("That token was rejected. Check it and try again.");
        return;
      }

      await setStoredToken(trimmed);
      router.replace("/");
    } catch {
      setError("Can't reach the server — check the app's configured server address.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Connect to Post Anki</Text>
      <Text style={styles.subtitle}>
        {clearReason === "revoked"
          ? "Your session ended — reconnect with a new token below."
          : "Paste the personal access token you minted on your own machine."}
      </Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="pat_..."
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        disabled={busy}
        onPress={connect}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Connect</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    color: "#111",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  error: {
    color: "#b91c1c",
    marginBottom: 12,
    fontSize: 13,
  },
  button: {
    backgroundColor: "#111",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});
