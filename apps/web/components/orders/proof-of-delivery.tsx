'use client';

import * as React from 'react';
import { Camera } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FoodImage } from '@/components/menu/food-image';
import { assetUrl } from '@/lib/asset-url';
import { cn } from '@/lib/utils';

/**
 * The photo the delivery partner took at the door. Shown as a thumbnail that
 * opens full size — for the customer, the restaurant and the rider alike.
 */
export function ProofOfDelivery({
  url,
  orderNumber,
  className,
}: {
  url: string | null | undefined;
  orderNumber: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  if (!url) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('group relative block overflow-hidden rounded-lg border border-border', className)}
        aria-label={`View delivery photo for ${orderNumber}`}
        data-testid="proof-thumb"
      >
        <FoodImage src={url} alt={`Proof of delivery for order ${orderNumber}`} className="h-24 w-24 transition-transform group-hover:scale-105" />
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
          <Camera className="h-3 w-3" /> Delivered
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Proof of delivery</DialogTitle>
            <DialogDescription>Photo taken by the delivery partner for order {orderNumber}.</DialogDescription>
          </DialogHeader>
          <FoodImage src={url} alt={`Proof of delivery for order ${orderNumber}`} placeholder={false} className="max-h-[70vh] w-full rounded-md object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
