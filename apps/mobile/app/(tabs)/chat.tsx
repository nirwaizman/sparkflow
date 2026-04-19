import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { streamChat, type ChatMessage } from "../../lib/chat-stream";

type UiMessage = ChatMessage & { id: string };

export default function ChatScreen() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList<UiMessage> | null>(null);

  const send = useCallback(async () => {
    const content = input.trim();
    if (content.length === 0 || streaming) return;
    setError(null);

    const userMsg: UiMessage = { id: `u-${Date.now()}`, role: "user", content };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: UiMessage = { id: assistantId, role: "assistant", content: "" };

    const nextHistory: ChatMessage[] = [...messages, userMsg].map(({ role, content }) => ({
      role,
      content,
    }));

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    await streamChat({
      messages: nextHistory,
      signal: controller.signal,
      onToken: (token) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + token } : m)),
        );
      },
      onError: (err) => {
        setError(err.message);
      },
      onFinish: () => {
        setStreaming(false);
        abortRef.current = null;
      },
    });
    // In case onFinish wasn't called (e.g. early error).
    setStreaming(false);
    abortRef.current = null;
  }, [input, messages, streaming]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0b0f" }} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m: UiMessage) => m.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }: { item: UiMessage }) => <Bubble message={item} />}
          ListEmptyComponent={<EmptyState />}
        />

        {error ? (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 8,
              padding: 12,
              backgroundColor: "#3a1616",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#ef4444",
            }}
          >
            <Text style={{ color: "#fecaca" }} accessibilityRole="alert">
              {error}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            padding: 12,
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: "#2a2a3a",
            backgroundColor: "#0b0b0f",
          }}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Message SparkFlow"
            placeholderTextColor="#6b7280"
            editable={!streaming}
            multiline
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 140,
              color: "#f5f5f7",
              backgroundColor: "#131320",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#2a2a3a",
              paddingHorizontal: 14,
              paddingVertical: 10,
              textAlign: "auto",
              writingDirection: "auto",
            }}
          />
          {streaming ? (
            <Pressable
              onPress={stop}
              style={{
                backgroundColor: "#ef4444",
                paddingHorizontal: 16,
                height: 44,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>Stop</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={send}
              disabled={input.trim().length === 0}
              style={{
                backgroundColor: input.trim().length === 0 ? "#2a2a3a" : "#7c5cff",
                paddingHorizontal: 16,
                height: 44,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                opacity: input.trim().length === 0 ? 0.6 : 1,
              }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>Send</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ message }: { message: UiMessage }) {
  const isUser = message.role === "user";
  return (
    <View
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
        backgroundColor: isUser ? "#7c5cff" : "#131320",
        borderWidth: isUser ? 0 : 1,
        borderColor: "#2a2a3a",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 16,
      }}
    >
      {message.content.length === 0 ? (
        <ActivityIndicator size="small" color={isUser ? "#ffffff" : "#9ca0b3"} />
      ) : (
        <Text
          style={{
            color: isUser ? "#ffffff" : "#f5f5f7",
            fontSize: 15,
            lineHeight: 21,
            textAlign: "auto",
            writingDirection: "auto",
          }}
        >
          {message.content}
        </Text>
      )}
    </View>
  );
}

function EmptyState() {
  return (
    <View style={{ alignItems: "center", paddingVertical: 64 }}>
      <Text style={{ color: "#9ca0b3", fontSize: 16, textAlign: "center" }}>
        Start a conversation with SparkFlow.
      </Text>
      <Text style={{ color: "#6b7280", fontSize: 13, marginTop: 6, textAlign: "center" }}>
        English, עברית, or mixed — both directions are supported.
      </Text>
    </View>
  );
}
