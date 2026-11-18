'use client';

import { useId, useState, type CSSProperties } from 'react';
import { MapPin, Star } from 'lucide-react';
import { digits } from '@/lib/format';
import type { Cafe } from '@/lib/types';
import { LocationMap, hasPosition } from './location-map';
import { FavoriteButton } from './browse-cards';
import { Modal } from './ui';

export function VitrinCafeHero({ cafe, cover, vip }: { cafe: Cafe; cover?: string; vip: boolean }) {
  const clip = 'cafe-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [map, setMap] = useState(false);
  const coordinates = hasPosition(cafe);
  const address = cafe.address.startsWith(cafe.city + '،')
    ? cafe.address
    : [cafe.city, cafe.address].filter(Boolean).join('، ');
  return (
    <section className="vitrin-cafe-hero">
      <svg className="vitrin-cafe-clip" aria-hidden="true">
        <defs>
          <clipPath id={clip} clipPathUnits="objectBoundingBox">
            <path d="M 0 0 H 1 V 1.008 Q 0.5 0.575 0 1.008 Z" />
          </clipPath>
          <clipPath id={clip + '-mobile'} clipPathUnits="objectBoundingBox">
            <path d="M 0 0 H 1 V 1.015 Q 0.5 0.82 0 1.015 Z" />
          </clipPath>
        </defs>
      </svg>
      <div
        className="vitrin-cafe-hero-cover"
        style={
          {
            '--hero-clip': 'url(#' + clip + ')',
            '--hero-clip-mobile': 'url(#' + clip + '-mobile)',
          } as CSSProperties
        }
      >
        {cover && <img className="vitrin-cafe-hero-photo" src={cover} alt="" />}
        <div className="vitrin-cafe-hero-details">
          <span className="vitrin-cafe-hero-rating">
            <Star size={16} aria-hidden="true" />
            {cafe.rating && cafe.review_count ? (
              <>
                {digits(cafe.rating.toFixed(1))} <span>({digits(cafe.review_count)} نظر)</span>
              </>
            ) : (
              'بدون نظر'
            )}
          </span>
          <h1>{cafe.name}</h1>
          {vip && <span className="badge">کافه ویژه</span>}
          {cafe.description && <p>{cafe.description}</p>}
          {address &&
            (coordinates ? (
              <button className="vitrin-cafe-address" type="button" onClick={() => setMap(true)}>
                <MapPin size={16} /> {address}
              </button>
            ) : (
              <p className="vitrin-cafe-address">
                <MapPin size={16} /> {address}
              </p>
            ))}
        </div>
      </div>
      <div className="vitrin-cafe-hero-logo" aria-hidden="true">
        {cafe.logo ? <img src={cafe.logo} alt="" /> : cafe.name.slice(0, 1)}
      </div>
      <div className="vitrin-cafe-favorite">
        <FavoriteButton id={cafe.id} />
      </div>
      {coordinates && (
        <Modal open={map} title={'موقعیت ' + cafe.name} onClose={() => setMap(false)}>
          <p className="muted">{address}</p>
          <LocationMap points={[cafe]} selected={cafe.id} label={'موقعیت ' + cafe.name} />
        </Modal>
      )}
    </section>
  );
}
