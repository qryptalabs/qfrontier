import { renderGamePage, type GameSearchParams } from './game-page';

export const dynamic = "force-dynamic";

export default async function Home({searchParams}:{searchParams?:Promise<GameSearchParams>}) {
  return renderGamePage('/',searchParams);
}
