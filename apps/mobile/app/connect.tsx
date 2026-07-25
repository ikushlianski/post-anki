import { useState } from "react";
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
import { setStoredToken } from "../src/api/token-storage";

export default function ConnectScreen() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    const trimmed = token.trim();

    if (trimmed.length === 0) {
      setError("Paste a token first.");
      return;
    }

    setBusy(true);
    setError(null);

    const ok = await verifyToken(trimmed);

    if (!ok) {
      setBusy(false);
      setError("That token was rejected. Check it and try again.");
      return;
    }

    await setStoredToken(trimmed);
    setBusy(false);
    router.replace("/");
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Connect to Post Anki</Text>
      <Text style={styles.subtitle}>
        Paste the personal access token you minted on your own machine.
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
