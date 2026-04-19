import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { I18nManager, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../src/global.css";

export default function RootLayout() {
  useEffect(() => {
    // Hebrew/English bidi: allow RN to mirror layout when the device locale
    // is RTL, but don't force-flip when it isn't. Text itself is rendered
    // with writingDirection: "auto" in individual screens so inline Hebrew
    // inside English (and vice versa) still renders correctly.
    if (I18nManager.allowRTL) {
      I18nManager.allowRTL(true);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: "#0b0b0f" }}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#0b0b0f" },
          }}
        >
          <Stack.Screen name="(tabs)" />
        </Stack>
      </View>
    </SafeAreaProvider>
  );
}
