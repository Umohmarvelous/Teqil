// components/CommentSheet.tsx
import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, Image, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert
} from "react-native";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Heart, Send } from "@hugeicons/core-free-icons";
import BottomSheet, {
  BottomSheetBackdrop, BottomSheetTextInput, BottomSheetFlatList
} from "@gorhom/bottom-sheet";
import { FeedItem, Comment } from "@/app/(main)/discover"; // adjust path
import { Colors } from "@/constants/colors";

interface Props {
  bottomSheetRef: React.RefObject<BottomSheet | null>;
  post: FeedItem | null;
  isDark: boolean;
  onClose: () => void;
  onAddComment: (postId: string, text: string) => void;
}

export function CommentSheet({ bottomSheetRef, post, isDark, onClose, onAddComment }: Props) {
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const snapPoints = useMemo(() => ["70%", "95%"], []);

  const fetchComments = useCallback(async (postId: string) => {
    setLoadingComments(true);
    try {
      const res = await fetch(`https://www.reddit.com/comments/${postId}.json?raw_json=1`);
      const json = await res.json();
      const commentData = json[1].data.children
        .filter((c: any) => c.kind === "t1" && c.data.body)
        .map((c: any) => ({
          id: c.data.id,
          user: {
            id: c.data.author,
            username: c.data.author,
            avatarUrl: `https://www.redditstatic.com/avatars/defaults/v2/avatar_default_${Math.floor(Math.random() * 7)}.png`,
          },
          text: c.data.body,
          timestamp: new Date(c.data.created_utc * 1000).toLocaleString(),
          likes: c.data.ups || 0,
        }));
      setComments(commentData);
    } catch (err) {
      Alert.alert("Error", "Could not load comments");
      console.log(err)
    } finally {
      setLoadingComments(false);
    }
  }, []);

  useEffect(() => {
    if (post?.type === "content" && post?.comments.length === 0) {
      fetchComments(post.id);
    } else {
      setComments(post?.comments || []);
    }
  }, [post?.id, post?.comments, post?.type, fetchComments]);

  const handleSend = () => {
    if (!commentText.trim() || !post) return;
    onAddComment(post.id, commentText.trim());
    setCommentText("");
  };

  const renderBackdrop = useCallback(
    (props: any) => (<BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.2} />),
    []
  );

  if (!post) return null;

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const bgColor = isDark ? Colors.primaryDarker : Colors.textWhite;
  const inputBg = isDark ? "#2A2A40" : "#F2F2F2";

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onClose={onClose}
      backgroundStyle={{ backgroundColor: bgColor }}
      handleIndicatorStyle={{ backgroundColor: subColor }}
    >
      <View style={styles.sheetContainer}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: textColor }]}>Comments</Text>
          <Pressable onPress={onClose}>
            <Text style={[styles.sheetClose, { color: Colors.primary }]}>Close</Text>
          </Pressable>
        </View>

        {loadingComments ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <BottomSheetFlatList
            data={comments}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.commentsList}
            renderItem={({ item }) => (
              <View style={styles.commentItem}>
                <Image source={{ uri: item.user.avatarUrl }} style={styles.commentAvatar} />
                <View style={styles.commentContent}>
                  <Text style={[styles.commentText, { color: textColor }]}>
                    <Text style={styles.commentUsername}>{item.user.username}</Text> {item.text}
                  </Text>
                  <View style={styles.commentMeta}>
                    <Text style={[styles.commentTime, { color: subColor }]}>{item.timestamp}</Text>
                    <Text style={[styles.commentLikes, { color: subColor }]}>{item.likes} likes</Text>
                    <Pressable>
                      <Text style={[styles.commentReply, { color: subColor }]}>Reply</Text>
                    </Pressable>
                  </View>
                </View>
                <Pressable hitSlop={8}>
                  <HugeiconsIcon icon={Heart} size={14} color={subColor} />
                </Pressable>
              </View>
            )}
            ListEmptyComponent={
              <Text style={[styles.noComments, { color: subColor }]}>No comments yet.</Text>
            }
          />
        )}

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.commentInputContainer, { borderTopColor: isDark ? "#333" : "#E5E5E5" }]}>
            <Image source={{ uri: "https://i.pravatar.cc/150?img=7" }} style={styles.commentAvatarSmall} />
            <BottomSheetTextInput
              style={[styles.commentInput, { backgroundColor: inputBg, color: textColor }]}
              placeholder="Add a comment..."
              placeholderTextColor={subColor}
              value={commentText}
              onChangeText={setCommentText}
              multiline
            />
            <Pressable
              onPress={handleSend}
              disabled={!commentText.trim()}
              style={[styles.sendButton, { opacity: commentText.trim() ? 1 : 0.4 }]}
            >
              <HugeiconsIcon icon={Send} size={22} color={Colors.primary} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetContainer: { flex: 1 },
  sheetHeader: {
    flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#DBDBDB",
  },
  sheetTitle: { fontSize: 16, fontFamily: "Poppins_600SemiBold" },
  sheetClose: { fontSize: 15, fontFamily: "Poppins_500Medium" },
  commentsList: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16 },
  commentItem: { flexDirection: "row", marginBottom: 16 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  commentContent: { flex: 1 },
  commentText: { fontSize: 13, lineHeight: 18 },
  commentUsername: { fontFamily: "Poppins_600SemiBold" },
  commentMeta: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 12 },
  commentTime: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  commentLikes: { fontFamily: "Poppins_500Medium", fontSize: 12 },
  commentReply: { fontFamily: "Poppins_500Medium", fontSize: 12 },
  noComments: { textAlign: "center", marginTop: 30 },
  commentInputContainer: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentAvatarSmall: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  commentInput: {
    flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
    fontSize: 14, maxHeight: 100,
  },
  sendButton: { marginLeft: 10 },
});