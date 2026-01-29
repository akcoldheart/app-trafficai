import Head from 'next/head';
import Sidebar from './Sidebar';
import Footer from './Footer';
import PageHeader from './PageHeader';
import TopBar from './TopBar';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  pageTitle?: string;
  pagePretitle?: string;
  pageActions?: React.ReactNode;
}

export default function Layout({
  children,
  title = 'Traffic AI',
  pageTitle,
  pagePretitle,
  pageActions,
}: LayoutProps) {
  return (
    <>
      <Head>
        <title>{title ? `${title} - Traffic AI` : 'Traffic AI'}</title>
      </Head>

      <div className="page">
        <Sidebar />

        <div className="page-wrapper">
          <TopBar />

          {pageTitle && (
            <PageHeader title={pageTitle} pretitle={pagePretitle}>
              {pageActions}
            </PageHeader>
          )}

          <div className="page-body">
            <div className="container-xl">
              {children}
            </div>
          </div>

          <Footer />
        </div>
      </div>
    </>
  );
}
