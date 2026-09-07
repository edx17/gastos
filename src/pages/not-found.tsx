import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <Compass className="h-10 w-10 text-muted-foreground" />
      <div>
        <p className="text-2xl font-semibold">Esta página no existe</p>
        <p className="mt-1 text-sm text-muted-foreground">Puede que el enlace esté viejo o mal escrito.</p>
      </div>
      <Link to="/app/dashboard" className={buttonVariants()}>
        Ir al inicio
      </Link>
    </div>
  );
}
