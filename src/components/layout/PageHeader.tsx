interface PageHeaderProps {
  title: string;
  pretitle?: string;
  children?: React.ReactNode;
}

export default function PageHeader({ title, pretitle, children }: PageHeaderProps) {
  return (
    <div className="page-header d-print-none">
      <div className="container-xl">
        <div className="row g-2 align-items-center">
          <div className="col-auto">
            {pretitle && <div className="page-pretitle">{pretitle}</div>}
            <h2 className="page-title">{title}</h2>
          </div>
          {children && (
            <div className="col-auto ms-auto d-print-none">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
