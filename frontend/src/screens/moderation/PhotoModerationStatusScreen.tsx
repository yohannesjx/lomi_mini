import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import {
    ActivityIndicator,
    Alert,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { UserService } from '../../api/services';
import { Button } from '../../components/ui/Button';
import { COLORS, SIZES, SPACING } from '../../theme/colors';
import { useOnboardingStore } from '../../store/onboardingStore';

interface ModerationPhoto {
    id: string;
    batch_id?: string;
    media_type: 'photo' | 'video';
    status: 'pending' | 'approved' | 'rejected' | 'failed';
    reason?: string;
    moderated_at?: string;
    uploaded_at?: string;
    display_order?: number;
    url?: string;
    scores?: Record<string, number>;
}

interface ModerationSummary {
    total_photos: number;
    approved: number;
    pending: number;
    rejected: number;
    failed: number;
    needs_more_photos: boolean;
    pending_batches: number;
    last_moderated_at?: string;
}

interface ModerationStatusResponse {
    summary: ModerationSummary;
    photos: ModerationPhoto[];
}

const STATUS_META: Record<string, { label: string; color: string; background: string; emoji: string }> = {
    approved: { label: 'Approved', color: '#065f46', background: 'rgba(16, 185, 129, 0.15)', emoji: '✅' },
    pending: { label: 'Pending', color: '#92400e', background: 'rgba(251, 191, 36, 0.2)', emoji: '⏳' },
    rejected: { label: 'Rejected', color: '#7f1d1d', background: 'rgba(248, 113, 113, 0.2)', emoji: '❌' },
    failed: { label: 'Error', color: '#7c2d12', background: 'rgba(251, 146, 60, 0.2)', emoji: '⚠️' },
};

const REASON_TEXT: Record<string, string> = {
    blurry: 'Photo is blurry — take a sharper photo in good light.',
    no_face: "We couldn't detect a face. Make sure your face is visible.",
    underage: 'Photo looks underage. Please upload a recent adult photo.',
    nsfw: 'Photo is not appropriate for Lomi.',
};

const formatDateTime = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
};

export const PhotoModerationStatusScreen = ({ navigation, route }: any) => {
    const { source = 'profile', batchId } = route?.params || {};
    const [status, setStatus] = useState<ModerationStatusResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCompleting, setIsCompleting] = useState(false);
    const [shouldAutoRefresh, setShouldAutoRefresh] = useState(true);
    const { updateStep } = useOnboardingStore();

    const loadStatus = useCallback(async (silent = false) => {
        try {
            if (!silent) setIsLoading(true);
            const response = await UserService.getModerationStatus();
            setStatus(response);
            setError(null);
            const pending = response.summary?.pending ?? 0;
            const approved = response.summary?.approved ?? 0;
            setShouldAutoRefresh(pending > 0 || approved < 2);
        } catch (err: any) {
            console.error('Failed to load moderation status', err);
            const message = err?.response?.data?.error || err?.message || 'Failed to load moderation status';
            setError(message);
        } finally {
            if (!silent) setIsLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadStatus();
        }, [loadStatus])
    );

    useFocusEffect(
        useCallback(() => {
            if (!shouldAutoRefresh) {
                return undefined;
            }
            const interval = setInterval(() => loadStatus(true), 5000);
            return () => clearInterval(interval);
        }, [shouldAutoRefresh, loadStatus])
    );

    const summary = status?.summary ?? {
        total_photos: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
        failed: 0,
        needs_more_photos: true,
        pending_batches: 0,
    };

    const photos = useMemo(() => {
        if (!status?.photos?.length) return [];
        if (!batchId) return status.photos;
        const batchMatches = status.photos.filter(photo => photo.batch_id === batchId);
        const others = status.photos.filter(photo => photo.batch_id !== batchId);
        return [...batchMatches, ...others];
    }, [status?.photos, batchId]);

    const canContinue = summary.approved >= 2;

    const handleContinue = async () => {
        if (source === 'onboarding') {
            if (!canContinue) {
                Alert.alert('Still pending', 'You need at least 2 approved photos to continue.');
                return;
            }
            try {
                setIsCompleting(true);
                await updateStep(5);
                navigation.navigate('Video');
            } catch (err: any) {
                console.error('Failed to update onboarding step', err);
                const message = err?.response?.data?.error || err?.message || 'Failed to continue. Please try again.';
                Alert.alert('Error', message);
            } finally {
                setIsCompleting(false);
            }
        } else {
            navigation.goBack();
        }
    };

    const handleUploadMore = () => {
        if (source === 'onboarding') {
            navigation.navigate('PhotoUpload');
            return;
        }
        navigation.navigate('Onboarding', { screen: 'PhotoUpload' });
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadStatus();
    };

    const renderPhotoCard = (photo: ModerationPhoto) => {
        const meta = STATUS_META[photo.status] || STATUS_META.pending;
        const isHighlighted = batchId && photo.batch_id === batchId;
        return (
            <View key={photo.id} style={[styles.photoCard, isHighlighted && styles.highlightedCard]}>
                <View style={styles.photoRow}>
                    <View style={styles.photoPreview}>
                        {photo.url ? (
                            <Image source={{ uri: photo.url }} style={styles.photoImage} />
                        ) : (
                            <View style={styles.photoPlaceholder}>
                                <Text style={{ fontSize: 32 }}>{photo.media_type === 'video' ? '🎥' : '📸'}</Text>
                            </View>
                        )}
                    </View>
                    <View style={styles.photoDetails}>
                        <View style={styles.statusRow}>
                            <View style={[styles.statusPill, { backgroundColor: meta.background }]}> 
                                <Text style={[styles.statusText, { color: meta.color }]}>
                                    {meta.emoji} {meta.label}
                                </Text>
                            </View>
                            {isHighlighted && (
                                <Text style={styles.batchTag}>Newest batch</Text>
                            )}
                        </View>
                        <Text style={styles.timestampLabel}>Uploaded: {formatDateTime(photo.uploaded_at)}</Text>
                        {photo.moderated_at ? (
                            <Text style={styles.timestampLabel}>Moderated: {formatDateTime(photo.moderated_at)}</Text>
                        ) : (
                            <Text style={styles.timestampLabel}>Waiting for review...</Text>
                        )}
                        {photo.status === 'rejected' && (
                            <View style={styles.reasonBox}>
                                <Text style={styles.reasonTitle}>Reason</Text>
                                <Text style={styles.reasonText}>{REASON_TEXT[photo.reason || ''] || 'Please upload a clearer, friendly photo.'}</Text>
                            </View>
                        )}
                        {photo.status === 'pending' && (
                            <Text style={styles.pendingHint}>⏱ Usually done in under 30 seconds</Text>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
            <SafeAreaView style={styles.safeArea} edges={['bottom']}>
                <View style={styles.header}>
                    <Text style={styles.title}>Photo Moderation</Text>
                    <Text style={styles.subtitle}>
                        We review every photo automatically for blur, faces, age, and safety.
                    </Text>
                </View>

                {isLoading && !status ? (
                    <View style={styles.loadingState}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                        <Text style={styles.loadingText}>Checking your photos...</Text>
                    </View>
                ) : (
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
                        {error && (
                            <View style={styles.errorBox}>
                                <Text style={styles.errorText}>{error}</Text>
                                <Button title="Try Again" onPress={() => loadStatus()} variant="outline" style={{ marginTop: SPACING.s }} />
                            </View>
                        )}

                        <View style={styles.summaryCard}>
                            <View style={styles.summaryRow}>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryLabel}>Approved</Text>
                                    <Text style={styles.summaryValue}>{summary.approved}</Text>
                                </View>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryLabel}>Pending</Text>
                                    <Text style={styles.summaryValue}>{summary.pending}</Text>
                                </View>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryLabel}>Rejected</Text>
                                    <Text style={styles.summaryValue}>{summary.rejected}</Text>
                                </View>
                            </View>
                            <Text style={styles.summaryHint}>
                                {summary.approved >= 2
                                    ? 'You have enough approved photos to continue.'
                                    : 'Need at least 2 approved photos to unlock swiping.'}
                            </Text>
                            {summary.last_moderated_at && (
                                <Text style={styles.lastUpdated}>Last update: {formatDateTime(summary.last_moderated_at)}</Text>
                            )}
                        </View>

                        {!photos.length && (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyEmoji}>📷</Text>
                                <Text style={styles.emptyTitle}>No photos yet</Text>
                                <Text style={styles.emptyText}>Upload photos to start moderation.</Text>
                            </View>
                        )}

                        {photos.map(renderPhotoCard)}
                    </ScrollView>
                )}

                <View style={styles.footer}>
                    <Button
                        title={source === 'onboarding' ? 'Continue' : 'Done'}
                        onPress={handleContinue}
                        disabled={source === 'onboarding' ? !canContinue : false}
                        isLoading={isCompleting}
                        size="large"
                    />
                    <Button
                        title="Upload more photos"
                        onPress={handleUploadMore}
                        variant="outline"
                        size="large"
                        style={{ marginTop: SPACING.s }}
                    />
                    {source === 'onboarding' && !canContinue && (
                        <Text style={styles.helperText}>
                            Need {Math.max(0, 2 - summary.approved)} more approved photo(s) to continue.
                        </Text>
                    )}
                </View>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    safeArea: {
        flex: 1,
    },
    header: {
        paddingHorizontal: SPACING.l,
        paddingTop: SPACING.l,
        paddingBottom: SPACING.m,
    },
    scrollView: {
        flex: 1,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
    },
    subtitle: {
        marginTop: SPACING.xs,
        fontSize: 16,
        color: COLORS.textSecondary,
        lineHeight: 22,
    },
    loadingState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: SPACING.m,
        color: COLORS.textSecondary,
    },
    scrollContent: {
        paddingHorizontal: SPACING.l,
        paddingBottom: 200, // Extra padding for sticky footer
    },
    summaryCard: {
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusL,
        padding: SPACING.l,
        marginBottom: SPACING.l,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: SPACING.m,
    },
    summaryItem: {
        flex: 1,
        alignItems: 'center',
    },
    summaryLabel: {
        color: COLORS.textSecondary,
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    summaryValue: {
        marginTop: SPACING.xs,
        fontSize: 28,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
    },
    summaryHint: {
        fontSize: 14,
        color: COLORS.textSecondary,
        textAlign: 'center',
    },
    lastUpdated: {
        marginTop: SPACING.s,
        fontSize: 12,
        color: COLORS.textTertiary,
        textAlign: 'center',
    },
    photoCard: {
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusL,
        padding: SPACING.m,
        marginBottom: SPACING.m,
    },
    highlightedCard: {
        borderWidth: 1,
        borderColor: COLORS.primary,
    },
    photoRow: {
        flexDirection: 'row',
    },
    photoPreview: {
        width: 80,
        height: 100,
        borderRadius: SIZES.radiusM,
        overflow: 'hidden',
        backgroundColor: COLORS.surfaceHighlight,
        marginRight: SPACING.m,
    },
    photoImage: {
        width: '100%',
        height: '100%',
    },
    photoPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    photoDetails: {
        flex: 1,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.xs,
    },
    statusPill: {
        paddingHorizontal: SPACING.s,
        paddingVertical: 4,
        borderRadius: 999,
    },
    statusText: {
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    batchTag: {
        marginLeft: SPACING.s,
        fontSize: 12,
        color: COLORS.primary,
        fontWeight: '600',
    },
    timestampLabel: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    reasonBox: {
        marginTop: SPACING.s,
        backgroundColor: 'rgba(248, 113, 113, 0.15)',
        borderRadius: SIZES.radiusM,
        padding: SPACING.s,
    },
    reasonTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#991b1b',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    reasonText: {
        marginTop: 4,
        color: COLORS.textPrimary,
        fontSize: 13,
        lineHeight: 18,
    },
    pendingHint: {
        marginTop: SPACING.xs,
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: SPACING.l,
        paddingBottom: SPACING.l,
        borderTopWidth: 1,
        borderTopColor: COLORS.surfaceHighlight,
        backgroundColor: COLORS.background,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
    },
    helperText: {
        marginTop: SPACING.s,
        textAlign: 'center',
        color: COLORS.textSecondary,
        fontSize: 13,
    },
    errorBox: {
        backgroundColor: 'rgba(248, 113, 113, 0.15)',
        borderRadius: SIZES.radiusM,
        padding: SPACING.m,
        marginBottom: SPACING.l,
    },
    errorText: {
        color: '#991b1b',
        fontWeight: '600',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: SPACING.xl,
        borderRadius: SIZES.radiusL,
        borderWidth: 1,
        borderColor: COLORS.surfaceHighlight,
        marginBottom: SPACING.l,
    },
    emptyEmoji: {
        fontSize: 48,
        marginBottom: SPACING.s,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        marginBottom: SPACING.xs,
    },
    emptyText: {
        color: COLORS.textSecondary,
    },
});
