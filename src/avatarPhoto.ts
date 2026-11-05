/**
 * Profile photo — device-only by design.
 *
 * - Picked with the system photo picker (Android 13+ Photo Picker; no storage or camera
 *   permission is requested). The user crops to a square.
 * - Downscaled to 320×320 JPEG (~20–40 KB) and stored in app-private storage under its own
 *   key with a checksum, so the main learning record stays small.
 * - Never uploaded or synced: a face photo is personal data and the app has no feature that
 *   shows it to anyone else. It is removed by "Delete all data on this device".
 */
import {useSyncExternalStore} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {fnv1a} from './secure/integrity';

export const PHOTO_KEY = 'genz-code-avatar-photo';
export const PHOTO_SIZE = 320;
const MAX_BASE64 = 200_000; // ~150 KB decoded; a 320 px JPEG is far smaller
type Stored = {v: 1; sum: string; data: string; at: number};

let photo: string | null = null; // data URI
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());

/** Accept only bounded base64 JPEG/PNG payloads (magic bytes checked). */
export function validPhotoBase64(b64: unknown): b64 is string {
  return typeof b64 === 'string' && b64.length > 100 && b64.length <= MAX_BASE64 && /^[A-Za-z0-9+/]+={0,2}$/.test(b64) && (b64.startsWith('/9j/') || b64.startsWith('iVBORw0KGgo'));
}
const toUri = (b64: string) => `data:image/${b64.startsWith('/9j/') ? 'jpeg' : 'png'};base64,${b64}`;

export async function loadPhoto(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PHOTO_KEY);
    const v = raw ? (JSON.parse(raw) as Stored) : null;
    photo = v && v.v === 1 && validPhotoBase64(v.data) && fnv1a(v.data) === v.sum ? toUri(v.data) : null;
  } catch {photo = null;}
  emit();
}
export async function savePhotoBase64(b64: string): Promise<void> {
  if (!validPhotoBase64(b64)) throw new RangeError('Unsupported image');
  const record: Stored = {v: 1, sum: fnv1a(b64), data: b64, at: Date.now()};
  await AsyncStorage.setItem(PHOTO_KEY, JSON.stringify(record)); // UI updates only after the write
  photo = toUri(b64);
  emit();
}
export async function removePhoto(): Promise<void> {
  await AsyncStorage.removeItem(PHOTO_KEY);
  photo = null;
  emit();
}
/** Clears the in-memory copy after local data deletion removed the stored key. */
export function forgetPhoto() {photo = null; emit();}

export type PickResult = {ok: true} | {ok: false; cancelled?: boolean; message?: string};
/** Opens the system photo picker, crops square, downscales and stores the result. */
export async function pickAndSavePhoto(): Promise<PickResult> {
  const [Picker, Manipulator] = await Promise.all([import('expo-image-picker'), import('expo-image-manipulator')]);
  const picked = await Picker.launchImageLibraryAsync({mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1, exif: false, base64: false});
  if (picked.canceled || !picked.assets?.[0]) return {ok: false, cancelled: true};
  const asset = picked.assets[0];
  if (asset.fileSize && asset.fileSize > 25_000_000) return {ok: false, message: 'That image is too large. Choose one under 25 MB.'};
  const side = Math.min(asset.width || PHOTO_SIZE, asset.height || PHOTO_SIZE);
  const actions = [
    // Centre-crop to a square in case the platform picker did not crop (e.g. web).
    ...(asset.width && asset.height && asset.width !== asset.height ? [{crop: {originX: Math.floor((asset.width - side) / 2), originY: Math.floor((asset.height - side) / 2), width: side, height: side}}] : []),
    {resize: {width: PHOTO_SIZE, height: PHOTO_SIZE}},
  ];
  const out = await Manipulator.manipulateAsync(asset.uri, actions, {compress: 0.72, format: Manipulator.SaveFormat.JPEG, base64: true});
  if (!out.base64 || !validPhotoBase64(out.base64)) return {ok: false, message: 'That image couldn’t be processed. Try a different photo.'};
  await savePhotoBase64(out.base64);
  return {ok: true};
}

export const useAvatarPhoto = () => useSyncExternalStore(fn => {listeners.add(fn); return () => {listeners.delete(fn);};}, () => photo);
