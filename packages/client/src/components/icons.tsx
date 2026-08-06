import type { ReactNode, SVGProps } from 'react';

/**
 * 内联 SVG 图标（lucide 风格 path，24×24 / stroke）。
 * 遵循项目"禁止 emoji、必须用 icon"规范：等价 SVG 图标库，不引入额外依赖。
 */

export type IconProps = SVGProps<SVGSVGElement>;

const BASE: IconProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  width: 24,
  height: 24,
};

function Icon({ className, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg {...BASE} {...rest} className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

/** 加号：新建会话。 */
export function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** 铅笔：重命名会话。 */
export function IconPencil(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </Icon>
  );
}

/** 垃圾桶：删除会话。 */
export function IconTrash(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Icon>
  );
}

/** 对勾：确认重命名。 */
export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

/** 叉号：取消重命名 / 关闭。 */
export function IconX(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

/** 气泡：会话空态装饰。 */
export function IconMessageSquare(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Icon>
  );
}
