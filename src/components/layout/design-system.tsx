import { cn } from '@/lib/utils'

function DesignSystemWrapper({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className="bg-background w-full">
      <div
        data-slot="example-wrapper"
        className={cn(
          'mx-auto grid min-h-screen w-full max-w-5xl min-w-0 content-center items-start gap-8 p-4 pt-2 sm:gap-12 sm:p-6 md:grid-cols-2 md:gap-8 lg:p-12 2xl:max-w-6xl',

          className
        )}
        {...props}
      />
    </div>
  )
}

function DesignSystemExample({
  id,
  title,
  children,
  className,
  containerClassName,
  ...props
}: React.ComponentProps<'div'> & {
  id?: string
  title?: string
  containerClassName?: string
}) {
  return (
    <div
      id={id}
      data-slot="example"
      className={cn(
        'mx-auto flex w-full max-w-lg min-w-0 flex-col gap-1 self-stretch lg:max-w-none scroll-mt-24',
        containerClassName
      )}
      {...props}
    >
      {title && (
        <div className="text-muted-foreground px-1.5 py-2 text-xs font-medium">{title}</div>
      )}
      <div
        data-slot="example-content"
        className={cn(
          "bg-background text-foreground flex min-w-0 flex-1 flex-col items-start gap-6 border border-dashed p-4 sm:p-6 *:[div:not([class*='w-'])]:w-full",
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

function DesignSystemWithTOC({
  tocItems,
  children,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  tocItems: Array<{ label: string; id: string }>
}) {
  return (
    <div
      className={cn(
        'bg-background mx-auto relative min-h-screen w-full max-w-6xl min-w-0 gap-8 p-4 pt-2 sm:p-6 lg:gap-12 lg:p-12',
        className
      )}
      {...props}
    >
      <nav
        aria-label="Table of contents"
        className="fixed top-24 left-4 hidden w-48 shrink-0 lg:block z-10"
      >
        <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
          {tocItems.map(({ label, id }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="hover:text-foreground block rounded px-2 py-1.5 transition-colors"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main className="min-w-0 flex-1 lg:ml-56">{children}</main>
    </div>
  )
}

export { DesignSystemWrapper, DesignSystemExample, DesignSystemWithTOC }
