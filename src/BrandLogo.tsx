import logoEcoterra from "@/imports/logo_ecoterra.png"

// El viewBox encuadra el contenido visible del PNG sin alterar la imagen original.
export default function BrandLogo({ className }: { className?: string }) {
  return <svg className={className} viewBox="539 475 851 140" role="img" aria-label="Ecoterra" preserveAspectRatio="xMidYMid meet">
    <image href={logoEcoterra} width="1920" height="1080" />
  </svg>
}
