// Battery Optimization Help Dialog
// Shows OEM-specific instructions for disabling battery optimization
// that can prevent scheduled notifications from firing reliably

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Battery, 
  BatteryWarning,
  ExternalLink,
  Settings,
  Smartphone,
  AlertTriangle,
} from 'lucide-react';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';

interface BatteryOptimizationHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OEMInstructions {
  id: string;
  brand: string;
  icon: string;
  steps: string[];
  settingsPath?: string;
  additionalNotes?: string;
}

export function BatteryOptimizationHelp({ 
  open, 
  onOpenChange 
}: BatteryOptimizationHelpProps) {
  const { t } = useTranslation();

  const oemInstructions: OEMInstructions[] = [
    {
      id: 'samsung',
      brand: t('batteryHelp.samsung'),
      icon: '🔵',
      steps: [
        t('batteryHelp.samsungStep1'),
        t('batteryHelp.samsungStep2'),
        t('batteryHelp.samsungStep3'),
        t('batteryHelp.samsungStep4'),
        t('batteryHelp.samsungStep5'),
      ],
      additionalNotes: t('batteryHelp.samsungNote'),
    },
    {
      id: 'xiaomi',
      brand: t('batteryHelp.xiaomi'),
      icon: '🟠',
      steps: [
        t('batteryHelp.xiaomiStep1'),
        t('batteryHelp.xiaomiStep2'),
        t('batteryHelp.xiaomiStep3'),
        t('batteryHelp.xiaomiStep4'),
        t('batteryHelp.xiaomiStep5'),
      ],
      additionalNotes: t('batteryHelp.xiaomiNote'),
    },
    {
      id: 'huawei',
      brand: t('batteryHelp.huawei'),
      icon: '🔴',
      steps: [
        t('batteryHelp.huaweiStep1'),
        t('batteryHelp.huaweiStep2'),
        t('batteryHelp.huaweiStep3'),
        t('batteryHelp.huaweiStep4'),
        t('batteryHelp.huaweiStep5'),
      ],
      additionalNotes: t('batteryHelp.huaweiNote'),
    },
    {
      id: 'oppo',
      brand: t('batteryHelp.oppo'),
      icon: '🟢',
      steps: [
        t('batteryHelp.oppoStep1'),
        t('batteryHelp.oppoStep2'),
        t('batteryHelp.oppoStep3'),
        t('batteryHelp.oppoStep4'),
      ],
      additionalNotes: t('batteryHelp.oppoNote'),
    },
    {
      id: 'oneplus',
      brand: t('batteryHelp.oneplus'),
      icon: '🔴',
      steps: [
        t('batteryHelp.oneplusStep1'),
        t('batteryHelp.oneplusStep2'),
        t('batteryHelp.oneplusStep3'),
        t('batteryHelp.oneplusStep4'),
      ],
    },
    {
      id: 'stock',
      brand: t('batteryHelp.stockAndroid'),
      icon: '🤖',
      steps: [
        t('batteryHelp.stockStep1'),
        t('batteryHelp.stockStep2'),
        t('batteryHelp.stockStep3'),
        t('batteryHelp.stockStep4'),
      ],
    },
  ];

  const handleOpenBatterySettings = async () => {
    try {
      // Try to open battery optimization settings - falls back to alarm settings
      await ShortcutPlugin.openAlarmSettings();
    } catch (error) {
      console.log('Could not open settings:', error);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
        <SheetHeader className="text-start pb-2">
          <SheetTitle className="flex items-center gap-2">
            <BatteryWarning className="h-5 w-5 text-warning" />
            {t('batteryHelp.title')}
          </SheetTitle>
          <SheetDescription>
            {t('batteryHelp.description')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(85vh-140px)] -mx-6 px-6">
          {/* Warning Alert */}
          <Alert className="mb-4 border-warning/50 bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-sm">
              {t('batteryHelp.warningMessage')}
            </AlertDescription>
          </Alert>

          {/* Quick Action Button */}
          <Button
            variant="outline"
            className="w-full mb-4 gap-2"
            onClick={handleOpenBatterySettings}
          >
            <Settings className="h-4 w-4" />
            {t('batteryHelp.openAppSettings')}
            <ExternalLink className="h-3 w-3 ms-auto opacity-50" />
          </Button>

          {/* OEM-specific Instructions */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              {t('batteryHelp.selectBrand')}
            </h3>
            <Accordion type="single" collapsible className="w-full">
              {oemInstructions.map((oem) => (
                <AccordionItem key={oem.id} value={oem.id}>
                  <AccordionTrigger className="text-start hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{oem.icon}</span>
                      <span>{oem.brand}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="ps-6 space-y-3">
                      <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                        {oem.steps.map((step, index) => (
                          <li key={index} className="leading-relaxed">
                            {step}
                          </li>
                        ))}
                      </ol>
                      {oem.additionalNotes && (
                        <p className="text-xs text-warning-foreground bg-warning/10 p-2 rounded">
                          💡 {oem.additionalNotes}
                        </p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          {/* General Tips */}
          <div className="bg-muted/50 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              {t('batteryHelp.generalTips')}
            </h3>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>{t('batteryHelp.tip1')}</li>
              <li>{t('batteryHelp.tip2')}</li>
              <li>{t('batteryHelp.tip3')}</li>
              <li>{t('batteryHelp.tip4')}</li>
            </ul>
          </div>

          {/* External Resource Link */}
          <a
            href="https://dontkillmyapp.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline mb-6"
          >
            <ExternalLink className="h-4 w-4" />
            {t('batteryHelp.learnMore')}
          </a>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
