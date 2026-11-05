import * as Auth from 'firebase/auth';
import type {Persistence} from 'firebase/auth';
import * as SecureStore from 'expo-secure-store';
import {secureStorageKey} from './policy';
type Storage={getItem:(key:string)=>Promise<string|null>;setItem:(key:string,value:string)=>Promise<void>;removeItem:(key:string)=>Promise<void>};
const storage:Storage={
 getItem:key=>SecureStore.getItemAsync(secureStorageKey(key)),
 setItem:(key,value)=>SecureStore.setItemAsync(secureStorageKey(key),value,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}),
 removeItem:key=>SecureStore.deleteItemAsync(secureStorageKey(key)),
};
// Firebase exports this only under the React Native conditional entry point.
const native=Auth as typeof Auth&{getReactNativePersistence:(storage:Storage)=>Persistence};
export const persistence=native.getReactNativePersistence(storage);
