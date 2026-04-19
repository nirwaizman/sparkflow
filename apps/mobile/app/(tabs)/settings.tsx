import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  DEFAULT_BACKEND_URL,
  backendFetch,
  clearBackendToken,
  getBackendConfig,
  setBackendToken,
  setBackendUrl,
} from "../../lib/backend";

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; status: number }
  | { kind: "err"; message: string };

export default function SettingsScreen() {
  const [url, setUrl] = useState(DEFAULT_BACKEND_URL);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  useEffect(() => {
    void (async () => {
      const cfg = await getBackendConfig();
      setUrl(cfg.url);
      setToken(cfg.token ?? "");
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(null);
    try {
      await setBackendUrl(url);
      if (token.trim().length === 0) {
        await clearBackendToken();
      } else {
        await setBackendToken(token);
      }
      setSaved("Saved.");
    } catch (err) {
      Alert.alert("Save failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTest({ kind: "running" });
    try {
      // Persist the current values before probing so backendFetch uses them.
      await setBackendUrl(url);
      if (token.trim().length > 0) await setBackendToken(token);
      const res = await backendFetch("/api/health");
      setTest({ kind: "ok", status: res.status });
    } catch (err) {
      setTest({
        kind: "err",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0b0f" }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <Section title="Backend">
          <Label>Backend URL</Label>
          <TextInput
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://api.sparkflow.example"
            placeholderTextColor="#6b7280"
            style={inputStyle}
          />

          <Label style={{ marginTop: 12 }}>Auth token</Label>
          <TextInput
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="Bearer token"
            placeholderTextColor="#6b7280"
            style={inputStyle}
          />
          <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>
            Stored with expo-secure-store (Keychain on iOS, EncryptedSharedPreferences on
            Android).
          </Text>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
            <Pressable
              onPress={save}
              disabled={saving}
              style={{
                flex: 1,
                backgroundColor: saving ? "#2a2a3a" : "#7c5cff",
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>
                {saving ? "Saving..." : "Save"}
              </Text>
            </Pressable>
            <Pressable
              onPress={testConnection}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#2a2a3a",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#f5f5f7" }}>Test</Text>
            </Pressable>
          </View>

          {saved ? <Text style={{ color: "#22c55e", marginTop: 8 }}>{saved}</Text> : null}
          {test.kind === "running" ? (
            <Text style={{ color: "#9ca0b3", marginTop: 8 }}>Testing...</Text>
          ) : null}
          {test.kind === "ok" ? (
            <Text style={{ color: "#22c55e", marginTop: 8 }}>
              Reached backend (HTTP {test.status}).
            </Text>
          ) : null}
          {test.kind === "err" ? (
            <Text style={{ color: "#fecaca", marginTop: 8 }}>Error: {test.message}</Text>
          ) : null}
        </Section>

        <Section title="About">
          <Text style={{ color: "#9ca0b3", lineHeight: 20 }}>
            SparkFlow Mobile — dark theme, Hebrew/English bidi support.{"\n"}
            Version 0.0.0
          </Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: "#131320",
        borderWidth: 1,
        borderColor: "#2a2a3a",
        padding: 16,
        borderRadius: 14,
        gap: 4,
      }}
    >
      <Text style={{ color: "#f5f5f7", fontWeight: "600", fontSize: 16, marginBottom: 8 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Label({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: { marginTop?: number };
}) {
  return (
    <Text style={[{ color: "#9ca0b3", fontSize: 12, marginBottom: 6 }, style]}>{children}</Text>
  );
}

const inputStyle = {
  color: "#f5f5f7",
  backgroundColor: "#1a1a2b",
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "#2a2a3a",
  paddingHorizontal: 14,
  paddingVertical: 10,
  textAlign: "auto" as const,
  writingDirection: "auto" as const,
};
