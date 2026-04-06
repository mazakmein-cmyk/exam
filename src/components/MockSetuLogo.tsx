interface MockSetuLogoProps {
  size?: number;
}

const MockSetuLogo = ({ size = 28 }: MockSetuLogoProps) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ms-logo-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#6C3EF4" />
        <stop offset="100%" stopColor="#A855F7" />
      </linearGradient>
    </defs>
    <path
      d="M3 22 C3 22 3 10 8.5 10 C10.5 10 12 12 14 14 C16 12 17.5 10 19.5 10 C25 10 25 22 25 22"
      stroke="url(#ms-logo-grad)"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M7 22 C7 22 7 14 11 14 C12.5 14 13.2 15.5 14 17 C14.8 15.5 15.5 14 17 14 C21 14 21 22 21 22"
      stroke="url(#ms-logo-grad)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      opacity="0.5"
    />
  </svg>
);

export default MockSetuLogo;
