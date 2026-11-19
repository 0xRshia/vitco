'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, MapPin, MessageCircleMore, Star } from 'lucide-react';
import { distanceKm, hasCoordinates, type GeoPoint } from '@/lib/cafe-discovery';
import { digits } from '@/lib/format';
import type { Cafe } from '@/lib/types';
import '@/app/explorer-cafe-card.css';

export function ExplorerCafeCard({
  cafe,
  selected = false,
  origin,
}: {
  cafe: Cafe;
  selected?: boolean;
  origin?: GeoPoint | null;
}) {
  const [failedCover, setFailedCover] = useState('');
  const cover = cafe.image || cafe.images?.[0];
  const location = cafe.city || cafe.address;
  const distance = origin && hasCoordinates(cafe) ? distanceKm(origin, cafe) : null;

  return (
    <Link
      className="explorer-cafe-card"
      href={'/cafes/' + encodeURIComponent(cafe.id)}
      aria-label={cafe.name}
      data-selected={selected || undefined}
      prefetch={false}
    >
      {cover && failedCover !== cover ? (
        <img
          className="explorer-cafe-photo"
          src={cover}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedCover(cover)}
        />
      ) : (
        <span className="explorer-cafe-no-photo">
          {cover ? 'تصویر در دسترس نیست' : 'بدون تصویر'}
        </span>
      )}
      <div className="explorer-cafe-caption">
        <h3 dir="auto">{cafe.name}</h3>
        <div className="explorer-cafe-meta">
          {cafe.rating === null ? (
            <span>
              <Star size={14} aria-hidden="true" />
              بدون نظر
            </span>
          ) : (
            <>
              <span>
                <Star size={14} fill="currentColor" aria-hidden="true" />
                {digits(cafe.rating.toFixed(1))}
              </span>
              <span>
                <MessageCircleMore size={14} aria-hidden="true" />
                {digits(cafe.review_count)} نظر
              </span>
            </>
          )}
          {location && (
            <span className="explorer-cafe-location">
              <MapPin size={14} aria-hidden="true" />
              <bdi>{location}</bdi>
            </span>
          )}
          {distance !== null && (
            <span>
              {distance < 1
                ? digits(Math.round(distance * 1000)) + ' متر'
                : digits(distance.toFixed(1)) + ' کیلومتر'}
            </span>
          )}
        </div>
        <div className="explorer-cafe-details">
          <div>
            {cafe.description && <p>{cafe.description}</p>}
            <span className="explorer-cafe-details-hint">
              مشاهده جزئیات کافه <ArrowLeft size={16} aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
