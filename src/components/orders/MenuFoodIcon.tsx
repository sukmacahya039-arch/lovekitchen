import React from 'react';

interface Props {
  iconKey: string;
  size?: number;
  className?: string;
}

/**
 * Crisp 2.5D-styled cartoon inline SVG food icons for Level-1 Burger Cafe menu items.
 * Zero external image dependencies so mobile PWA renders instantaneously offline.
 */
export const MenuFoodIcon: React.FC<Props> = ({ iconKey, size = 44, className = '' }) => {
  switch (iconKey) {
    case 'burger_classic':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
          <ellipse cx="32" cy="54" rx="22" ry="5" fill="#E8C7A8" opacity="0.55" />
          {/* Bottom bun */}
          <rect x="12" y="42" width="40" height="10" rx="5" fill="#E8A24A" stroke="#5C3A28" strokeWidth="2.5" />
          {/* Patty */}
          <rect x="10" y="34" width="44" height="10" rx="5" fill="#7C3F23" stroke="#4A2414" strokeWidth="2.5" />
          {/* Tomato & Lettuce */}
          <path d="M11 33 C17 29, 23 37, 29 33 C35 29, 41 37, 47 33 C50 31, 53 33, 53 35" stroke="#4ADE80" strokeWidth="5" strokeLinecap="round" />
          <rect x="15" y="29" width="34" height="5" rx="2.5" fill="#EF4444" />
          {/* Top dome bun */}
          <path d="M12 30 C12 15, 52 15, 52 30 Z" fill="#F5B356" stroke="#5C3A28" strokeWidth="2.5" />
          <ellipse cx="24" cy="22" rx="2" ry="1.1" fill="#FFF7E6" transform="rotate(-18 24 22)" />
          <ellipse cx="33" cy="20" rx="2" ry="1.1" fill="#FFF7E6" />
          <ellipse cx="42" cy="23" rx="2" ry="1.1" fill="#FFF7E6" transform="rotate(16 42 23)" />
        </svg>
      );

    case 'burger_cheese':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
          <ellipse cx="32" cy="54" rx="22" ry="5" fill="#E8C7A8" opacity="0.55" />
          <rect x="12" y="42" width="40" height="10" rx="5" fill="#E8A24A" stroke="#5C3A28" strokeWidth="2.5" />
          <rect x="10" y="34" width="44" height="10" rx="5" fill="#7C3F23" stroke="#4A2414" strokeWidth="2.5" />
          {/* Melted Cheddar Cheese Triangle */}
          <path d="M11 33 H53 L47 41 L35 37 L24 43 L14 36 Z" fill="#FACC15" stroke="#B45309" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 31 C18 27, 24 34, 32 30 C40 27, 46 34, 52 31" stroke="#4ADE80" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M12 29 C12 14, 52 14, 52 29 Z" fill="#F5B356" stroke="#5C3A28" strokeWidth="2.5" />
          <ellipse cx="25" cy="21" rx="2" ry="1.1" fill="#FFF7E6" transform="rotate(-15 25 21)" />
          <ellipse cx="35" cy="19" rx="2" ry="1.1" fill="#FFF7E6" />
          <ellipse cx="43" cy="22" rx="2" ry="1.1" fill="#FFF7E6" transform="rotate(15 43 22)" />
        </svg>
      );

    case 'burger_double':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
          <ellipse cx="32" cy="56" rx="23" ry="4.5" fill="#E8C7A8" opacity="0.55" />
          <rect x="12" y="45" width="40" height="9" rx="4.5" fill="#E8A24A" stroke="#5C3A28" strokeWidth="2.4" />
          {/* Lower Patty + Cheese */}
          <rect x="10" y="38" width="44" height="8" rx="4" fill="#7C3F23" stroke="#4A2414" strokeWidth="2.2" />
          <path d="M11 37 H53 L44 43 L31 39 L19 43 Z" fill="#FACC15" stroke="#B45309" strokeWidth="1.8" strokeLinejoin="round" />
          {/* Upper Patty + Cheese */}
          <rect x="10" y="29" width="44" height="8" rx="4" fill="#6D341B" stroke="#4A2414" strokeWidth="2.2" />
          <path d="M12 28 H52 L41 34 L25 32 L15 35 Z" fill="#FBBF24" stroke="#B45309" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M12 26 C18 23, 25 29, 32 25 C39 22, 46 28, 52 26" stroke="#4ADE80" strokeWidth="4" strokeLinecap="round" />
          {/* Top Bun */}
          <path d="M13 24 C13 11, 51 11, 51 24 Z" fill="#F5B356" stroke="#5C3A28" strokeWidth="2.4" />
          <ellipse cx="25" cy="17" rx="1.9" ry="1" fill="#FFF7E6" />
          <ellipse cx="34" cy="15.5" rx="1.9" ry="1" fill="#FFF7E6" />
          <ellipse cx="42" cy="18" rx="1.9" ry="1" fill="#FFF7E6" />
        </svg>
      );

    case 'french_fries':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
          <ellipse cx="32" cy="56" rx="19" ry="4" fill="#E8C7A8" opacity="0.55" />
          {/* Crispy Fries */}
          <rect x="18" y="13" width="6" height="24" rx="2.5" fill="#FACC15" stroke="#B45309" strokeWidth="2" transform="rotate(-10 18 13)" />
          <rect x="26" y="10" width="6" height="26" rx="2.5" fill="#FDE047" stroke="#B45309" strokeWidth="2" />
          <rect x="34" y="11" width="6" height="25" rx="2.5" fill="#FACC15" stroke="#B45309" strokeWidth="2" transform="rotate(6 34 11)" />
          <rect x="41" y="15" width="6" height="22" rx="2.5" fill="#FBBF24" stroke="#B45309" strokeWidth="2" transform="rotate(14 41 15)" />
          <rect x="22" y="16" width="6" height="20" rx="2.5" fill="#FBBF24" stroke="#B45309" strokeWidth="2" transform="rotate(-4 22 16)" />
          {/* Cute Red Carton */}
          <path d="M14 29 H50 L45 53 C44.6 54.8 43.2 56 41.4 56 H22.6 C20.8 56 19.4 54.8 19 53 L14 29 Z" fill="#EF4444" stroke="#7F1D1D" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M15 29 C23 36, 41 36, 49 29" fill="#DC2626" stroke="#7F1D1D" strokeWidth="2" />
          <circle cx="32" cy="44" r="5" fill="#FDE047" />
        </svg>
      );

    case 'chicken_nuggets':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
          <ellipse cx="32" cy="54" rx="22" ry="5" fill="#E8C7A8" opacity="0.55" />
          {/* Paper Boat */}
          <path d="M10 37 H54 L48 53 H16 L10 37 Z" fill="#FFFDF9" stroke="#5C3A28" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M14 43 H50" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
          {/* Crispy Golden Nuggets */}
          <rect x="14" y="25" width="16" height="13" rx="6" fill="#E59A38" stroke="#78350F" strokeWidth="2.2" transform="rotate(-12 14 25)" />
          <rect x="26" y="20" width="17" height="14" rx="6.5" fill="#F2AE4B" stroke="#78350F" strokeWidth="2.2" transform="rotate(6 26 20)" />
          <rect x="36" y="26" width="16" height="13" rx="6" fill="#DF8E2B" stroke="#78350F" strokeWidth="2.2" transform="rotate(14 36 26)" />
          {/* Dipping sauce dot */}
          <circle cx="25" cy="34" r="2" fill="#B45309" opacity="0.5" />
          <circle cx="38" cy="32" r="1.8" fill="#B45309" opacity="0.5" />
        </svg>
      );

    case 'iced_tea':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
          <ellipse cx="32" cy="56" rx="16" ry="4" fill="#E8C7A8" opacity="0.55" />
          {/* Straw */}
          <path d="M36 9 L44 9 L37 28" stroke="#EC4899" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          {/* Glass Cup */}
          <path d="M18 22 H46 L42 54 H22 L18 22 Z" fill="#FDE68A" stroke="#5C3A28" strokeWidth="2.4" strokeLinejoin="round" />
          {/* Amber Tea Liquid */}
          <path d="M20 27 H44 L41 52 H23 L20 27 Z" fill="#D97706" opacity="0.88" />
          {/* Ice cubes */}
          <rect x="24" y="30" width="8" height="8" rx="2" fill="#FEF3C7" opacity="0.85" transform="rotate(-10 24 30)" />
          <rect x="33" y="33" width="8" height="8" rx="2" fill="#FEF3C7" opacity="0.85" transform="rotate(12 33 33)" />
          {/* Lemon slice on rim */}
          <circle cx="19" cy="22" r="6" fill="#FACC15" stroke="#A16207" strokeWidth="2" />
          <circle cx="19" cy="22" r="3" fill="#FEF9C3" />
        </svg>
      );

    case 'strawberry_milkshake':
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
          <ellipse cx="32" cy="56" rx="16" ry="4" fill="#E8C7A8" opacity="0.55" />
          {/* Straw */}
          <path d="M37 8 L45 10 L36 25" stroke="#EF4444" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Tall Glass */}
          <path d="M18 26 H46 L41 54 H23 L18 26 Z" fill="#F9A8D4" stroke="#5C3A28" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M21 32 H43 L40 52 H24 L21 32 Z" fill="#F472B6" />
          {/* Whipped Cream Swirl */}
          <path d="M17 27 C17 18, 26 17, 32 13 C38 17, 47 18, 47 27 Z" fill="#FFFDF9" stroke="#5C3A28" strokeWidth="2.2" strokeLinejoin="round" />
          {/* Strawberry on top */}
          <circle cx="32" cy="14" r="4" fill="#EF4444" stroke="#991B1B" strokeWidth="1.8" />
          <path d="M25 36 L27 48" stroke="#FFFDF9" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
        </svg>
      );

    case 'chocolate_milkshake':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
          <ellipse cx="32" cy="56" rx="16" ry="4" fill="#E8C7A8" opacity="0.55" />
          {/* Straw */}
          <path d="M37 8 L45 10 L36 25" stroke="#F59E0B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Tall Glass */}
          <path d="M18 26 H46 L41 54 H23 L18 26 Z" fill="#92400E" stroke="#451A03" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M21 32 H43 L40 52 H24 L21 32 Z" fill="#78350F" />
          {/* Whipped Cream Swirl + Cocoa Drizzle */}
          <path d="M17 27 C17 18, 26 17, 32 13 C38 17, 47 18, 47 27 Z" fill="#FFFDF9" stroke="#5C3A28" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M23 22 C27 19, 36 24, 41 21" stroke="#78350F" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="32" cy="14" r="3.5" fill="#78350F" />
          <path d="M25 36 L27 48" stroke="#FDE68A" strokeWidth="2.5" strokeLinecap="round" opacity="0.45" />
        </svg>
      );
  }
};
