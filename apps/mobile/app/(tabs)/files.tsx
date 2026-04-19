import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { backendFetch, backendJson } from "../../lib/backend";

type RemoteFile = {
  id: string;
  name: string;
  size?: number;
  createdAt?: string;
};

type FilesListResponse = {
  files: RemoteFile[];
};

export default function FilesScreen() {
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await backendJson<FilesListResponse>("/api/files");
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pickAndUpload = useCallback(async () => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      setUploading(true);

      for (const asset of result.assets) {
        const form = new FormData();
        // RN FormData accepts the { uri, name, type } tuple shape.
        form.append(
          "file",
          {
            uri: asset.uri,
            name: asset.name,
            type: asset.mimeType ?? "application/octet-stream",
          } as unknown as Blob,
        );
        const res = await backendFetch("/api/files", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Upload failed (${res.status}): ${text}`);
        }
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0b0f" }} edges={["top"]}>
      <View style={{ flex: 1, padding: 16 }}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <Pressable
            onPress={pickAndUpload}
            disabled={uploading}
            style={{
              flex: 1,
              backgroundColor: uploading ? "#2a2a3a" : "#7c5cff",
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>
              {uploading ? "Uploading..." : "Pick files to upload"}
            </Text>
          </Pressable>
          <Pressable
            onPress={load}
            disabled={loading}
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
            <Text style={{ color: "#f5f5f7" }}>Refresh</Text>
          </Pressable>
        </View>

        <Text style={{ color: "#9ca0b3", fontSize: 12, marginBottom: 8 }}>
          Files are uploaded to /api/files on the configured backend.
        </Text>

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

        {loading && files.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color="#7c5cff" />
          </View>
        ) : (
          <FlatList
            data={files}
            keyExtractor={(f: RemoteFile) => f.id}
            contentContainerStyle={{ gap: 8, paddingBottom: 32 }}
            renderItem={({ item }: { item: RemoteFile }) => <FileRow file={item} />}
            ListEmptyComponent={
              <Text style={{ color: "#6b7280", textAlign: "center", marginTop: 32 }}>
                No files yet.
              </Text>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function FileRow({ file }: { file: RemoteFile }) {
  return (
    <View
      style={{
        backgroundColor: "#131320",
        borderWidth: 1,
        borderColor: "#2a2a3a",
        padding: 12,
        borderRadius: 12,
      }}
    >
      <Text
        style={{
          color: "#f5f5f7",
          fontWeight: "600",
          textAlign: "auto",
          writingDirection: "auto",
        }}
      >
        {file.name}
      </Text>
      <Text style={{ color: "#9ca0b3", fontSize: 12, marginTop: 4 }}>
        {formatSize(file.size)} {file.createdAt ? `• ${file.createdAt}` : ""}
      </Text>
    </View>
  );
}

function formatSize(bytes: number | undefined): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
