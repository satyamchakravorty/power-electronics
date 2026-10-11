import type { ReactNode } from 'react'

export function Card({
  icon,
  title,
  subtitle,
  actions,
  footer,
  className = '',
  children,
}: {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`card ${className}`}>
      <header className="card-head">
        {icon ? <span className="card-icon">{icon}</span> : null}
        <div className="card-titles">
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="card-actions">{actions}</div> : null}
      </header>
      {children}
      {footer ? <footer className="card-foot">{footer}</footer> : null}
    </section>
  )
}
