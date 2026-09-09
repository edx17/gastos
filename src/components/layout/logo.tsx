import { cn } from '@/lib/utils';
import { brand } from '@/config/brand';
import logoUrl from '@/assets/logo.png';

/**
 * La marca. El dibujo sale del ícono del sitio, recortado y sin fondo por
 * `scripts/build-logo.mjs`, así que apoya bien tanto en el tema claro como en
 * el oscuro sin necesidad de una placa atrás.
 */
export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img
        src={logoUrl}
        /* Con el nombre al lado la imagen no aporta nada al lector de pantalla. */
        alt={showName ? '' : brand.name}
        width={40}
        height={40}
        draggable={false}
        className="h-10 w-10 shrink-0 select-none drop-shadow-[0_3px_5px_hsl(var(--clay-shadow)/0.35)]"
      />
      {showName ? <span className="text-lg font-semibold tracking-tight">{brand.name}</span> : null}
    </div>
  );
}
