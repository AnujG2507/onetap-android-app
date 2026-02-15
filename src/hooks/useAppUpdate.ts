import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { AppUpdate } from '@capawesome/capacitor-app-update';

export const useAppUpdate = () => {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    const checkForUpdate = async () => {
      const info = await AppUpdate.getAppUpdateInfo();
      if (info.updateAvailability === 2) {
        // 2 = UPDATE_AVAILABLE
        await AppUpdate.performImmediateUpdate();
      }
    };
    checkForUpdate().catch(() => {});
  }, []);
};
