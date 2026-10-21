import { notFound } from 'next/navigation';
import { renderGamePage, type GameSearchParams } from '../game-page';
import { isGamePathname } from '../../lib/client/navigation';

export const dynamic='force-dynamic';

export default async function GameRoute({params,searchParams}:{params:Promise<{path:string[]}>;searchParams?:Promise<GameSearchParams>}) {
  const {path}=await params;
  const pathname=`/${path.map(encodeURIComponent).join('/')}`;
  if(!isGamePathname(pathname))notFound();
  return renderGamePage(pathname,searchParams);
}
