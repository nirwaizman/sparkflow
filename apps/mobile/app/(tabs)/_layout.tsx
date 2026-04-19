import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#0b0b0f" },
        headerTintColor: "#f5f5f7",
        headerTitleStyle: { color: "#f5f5f7", fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: "#131320",
          borderTopColor: "#2a2a3a",
        },
        tabBarActiveTintColor: "#7c5cff",
        tabBarInactiveTintColor: "#9ca0b3",
        tabBarLabelStyle: { fontSize: 12, fontWeight: "500" },
      }}
    >
      <Tabs.Screen name="chat" options={{ title: "Chat" }} />
      <Tabs.Screen name="files" options={{ title: "Files" }} />
      <Tabs.Screen name="tasks" options={{ title: "Tasks" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
