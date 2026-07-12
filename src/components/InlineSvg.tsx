type InlineSvgBase = {
  svg: string;
  className?: string;
};

type InlineSvgDecorative = InlineSvgBase & {
  "aria-hidden": true;
  role?: never;
  "aria-label"?: never;
};

type InlineSvgLabeled = InlineSvgBase & {
  role: "img";
  "aria-label": string;
  "aria-hidden"?: never;
};

export type InlineSvgProps = InlineSvgDecorative | InlineSvgLabeled;

export function InlineSvg(props: InlineSvgProps) {
  const { svg, className } = props;

  if (props.role === "img") {
    return (
      <div
        className={className}
        role="img"
        aria-label={props["aria-label"]}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
    <div
      className={className}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
