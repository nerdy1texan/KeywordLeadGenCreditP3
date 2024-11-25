import { ROUTES } from "@/config/site";

export default function ThemedLogo({ className }: { className?: string }) {
  return (
    <a
      href={ROUTES.home.path}
      title={ROUTES.home.title}
      className="flex rounded outline-none"
    >
      <div data-hide-on-theme="dark">
        <img
          className={className ? className : "h-10 w-auto"}
          src={`/logo_light.svg`}
          alt="KeywordLeadGen Logo"
        />
      </div>
      <div data-hide-on-theme="light">
        <img
          className={className ? className : "h-10 w-auto"}
          src={`/logo_dark.svg`}
          alt="KeywordLeadGen Logo"
        />
      </div>
    </a>
  );
}
