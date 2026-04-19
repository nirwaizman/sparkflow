import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { backendJson } from "../../lib/backend";

type Task = {
  id: string;
  title: string;
  status: "queued" | "running" | "done" | "failed" | string;
  createdAt?: string;
};

type TasksResponse = { tasks: Task[] };
type CreateTaskResponse = { task: Task };

export default function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await backendJson<TasksResponse>("/api/tasks");
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enqueue = useCallback(async () => {
    const trimmed = title.trim();
    if (trimmed.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await backendJson<CreateTaskResponse>("/api/tasks", {
        method: "POST",
        body: { title: trimmed },
      });
      setTitle("");
      if (data.task) {
        setTasks((prev) => [data.task, ...prev]);
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enqueue task");
    } finally {
      setSubmitting(false);
    }
  }, [title, submitting, load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0b0f" }} edges={["top"]}>
      <View style={{ flex: 1, padding: 16 }}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="New task title"
            placeholderTextColor="#6b7280"
            editable={!submitting}
            onSubmitEditing={enqueue}
            style={{
              flex: 1,
              color: "#f5f5f7",
              backgroundColor: "#131320",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#2a2a3a",
              paddingHorizontal: 14,
              paddingVertical: 10,
              textAlign: "auto",
              writingDirection: "auto",
            }}
          />
          <Pressable
            onPress={enqueue}
            disabled={submitting || title.trim().length === 0}
            style={{
              backgroundColor:
                submitting || title.trim().length === 0 ? "#2a2a3a" : "#7c5cff",
              paddingHorizontal: 16,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>Enqueue</Text>
          </Pressable>
        </View>

        {error ? (
          <View
            style={{
              padding: 12,
              backgroundColor: "#3a1616",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#ef4444",
              marginBottom: 12,
            }}
          >
            <Text style={{ color: "#fecaca" }}>{error}</Text>
          </View>
        ) : null}

        {loading && tasks.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color="#7c5cff" />
          </View>
        ) : (
          <FlatList
            data={tasks}
            keyExtractor={(t: Task) => t.id}
            contentContainerStyle={{ gap: 8, paddingBottom: 32 }}
            refreshing={loading}
            onRefresh={load}
            renderItem={({ item }: { item: Task }) => <TaskRow task={item} />}
            ListEmptyComponent={
              <Text style={{ color: "#6b7280", textAlign: "center", marginTop: 32 }}>
                No tasks yet.
              </Text>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <View
      style={{
        backgroundColor: "#131320",
        borderWidth: 1,
        borderColor: "#2a2a3a",
        padding: 12,
        borderRadius: 12,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Text
        style={{
          color: "#f5f5f7",
          flex: 1,
          textAlign: "auto",
          writingDirection: "auto",
        }}
      >
        {task.title}
      </Text>
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: statusBg(task.status),
        }}
      >
        <Text style={{ color: "white", fontSize: 11, fontWeight: "600" }}>{task.status}</Text>
      </View>
    </View>
  );
}

function statusBg(status: string): string {
  switch (status) {
    case "done":
      return "#22c55e";
    case "running":
      return "#7c5cff";
    case "failed":
      return "#ef4444";
    case "queued":
    default:
      return "#3f3f5a";
  }
}
