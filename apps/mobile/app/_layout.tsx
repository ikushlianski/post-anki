import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { getStoredToken, subscribeToStoredToken } from "../src/api/token-storage";

export default function RootLayout() {
  const [checked, setChecked] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    let active = true;

    void getStoredToken().then((token) => {
      if (!active) {
        return;
      }

      setHasToken(token !== null);
      setChecked(true);
    });

    const unsubscribe = subscribeToStoredToken((token) => {
      setHasToken(token !== null);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!checked || hasToken) {
      return;
    }

    const onConnectScreen = segments[0] === "connect";

    if (!onConnectScreen) {
      router.replace("/connect");
    }
  }, [checked, hasToken, segments, router]);

  if (!checked) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
