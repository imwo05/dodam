import { Link } from 'react-router-dom';

type PlaceScreenHeaderProps = {
  title: string;
  backTo: string;
  plusTo?: string;
};

export function PlaceScreenHeader({ title, backTo, plusTo = '/places/create/point' }: PlaceScreenHeaderProps) {
  return (
    <header className="place-screen-header" data-node-id="291:5414">
      <Link className="place-screen-header__back" to={backTo} aria-label="뒤로">
        <img src="/assets/header-back.svg" alt="" />
      </Link>
      <h1>{title}</h1>
      <Link className="place-screen-header__plus" to={plusTo} aria-label="장소 추가">
        <img src="/assets/place-plus.svg" alt="" />
      </Link>
    </header>
  );
}
