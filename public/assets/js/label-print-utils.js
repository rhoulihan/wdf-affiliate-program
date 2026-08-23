// Label Printing Utilities for Laundromat
(function() {
  'use strict';

  console.log('label-print-utils.js loading...');

  // Laundromat store address — printed on every bag label, below the
  // customer name, so a bag's destination/return point is always on the label.
  var STORE_ADDRESS_LINES = ['825 E Rundberg Ln, Suite F1', 'Austin, TX 78753'];

  // Render the store address (centered, small) starting at yTop; returns the y
  // position just below the block so callers can continue laying out content.
  function drawStoreAddress(pdf, pageWidth, yTop) {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    var y = yTop;
    STORE_ADDRESS_LINES.forEach(function (line) {
      pdf.text(line, pageWidth / 2, y, { align: 'center' });
      y += 0.16;
    });
    return y;
  }
  
  // Export to window for global access
  window.LabelPrintUtils = {
    
    // Generate and print bag labels
    generateAndPrintBagLabels: async function(labelData) {
      // Check if jsPDF is available
      if (typeof window.jspdf === 'undefined') {
        console.error('jsPDF library not loaded');
        throw new Error('PDF generation library not loaded. Please refresh the page and try again.');
      }
      
      // Check if QRCode is available
      if (typeof QRCode === 'undefined') {
        console.error('QRCode library not loaded');
        throw new Error('QR Code library not loaded. Please refresh the page and try again.');
      }
      
      // Create new PDF with 4x6 inch dimensions (standard shipping label size)
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: [4, 6]
      });
      
      let isFirstLabel = true;
      
      for (const label of labelData) {
        // Add new page for each label except the first
        if (!isFirstLabel) {
          pdf.addPage();
        }
        isFirstLabel = false;
        
        // Set margins and positions
        const margin = 0.375;
        const pageWidth = 4;
        const pageHeight = 6;
        const contentWidth = pageWidth - (margin * 2);
        
        // Add header
        pdf.setFontSize(20);
        pdf.setFont('helvetica', 'bold');
        pdf.text((window.BRAND && window.BRAND.name) || 'Laundromat', pageWidth / 2, margin + 0.3, { align: 'center' });
        
        // Add customer name
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'normal');
        pdf.text(label.customerName, pageWidth / 2, margin + 0.7, { align: 'center' });

        // Store address below the customer name
        drawStoreAddress(pdf, pageWidth, margin + 0.95);

        // Add phone and email if available (below the address block)
        pdf.setFontSize(11);
        let yPos = margin + 1.4;
        
        if (label.phone) {
          pdf.text(label.phone, pageWidth / 2, yPos, { align: 'center' });
          yPos += 0.2;
        }
        
        if (label.email) {
          pdf.text(label.email, pageWidth / 2, yPos, { align: 'center' });
          yPos += 0.2;
        }
        
        // Generate QR code using the same method as admin dashboard
        let qrImageUrl;
        try {
          qrImageUrl = await QRCode.toDataURL(label.qrCode, {
            width: 200,
            margin: 1,
            errorCorrectionLevel: 'H',
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });
        } catch (qrError) {
          console.error('QR Code generation error:', qrError);
          // Create a fallback placeholder if QR code fails
          const canvas = document.createElement('canvas');
          canvas.width = 200;
          canvas.height = 200;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#000';
          ctx.font = '20px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label.qrCode, 100, 100);
          qrImageUrl = canvas.toDataURL('image/png');
        }
        
        // Add QR code to PDF (centered)
        const qrSizeInInches = 2;
        const qrX = (pageWidth - qrSizeInInches) / 2;
        pdf.addImage(qrImageUrl, 'PNG', qrX, 2.3, qrSizeInInches, qrSizeInInches);
        
        // Add customer ID below QR code
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`ID: ${label.customerId}`, pageWidth / 2, 4.7, { align: 'center' });
        
        // Add instructions
        pdf.setFontSize(10);
        pdf.text('Scan this code to process this bag', pageWidth / 2, 5.2, { align: 'center' });
        
        // Add footer with date
        pdf.setFontSize(8);
        const printDate = new Date().toLocaleDateString();
        pdf.text(`Printed: ${printDate}`, pageWidth / 2, pageHeight - margin, { align: 'center' });
      }
      
      // Add auto-print JavaScript to the PDF
      // This will trigger print dialog when PDF is opened
      pdf.autoPrint();
      
      // Download the PDF with auto-print enabled
      const pdfBlob = pdf.output('blob');
      const fileName = `bag-labels-${new Date().getTime()}.pdf`;
      
      // Create download link
      const downloadLink = document.createElement('a');
      downloadLink.href = URL.createObjectURL(pdfBlob);
      downloadLink.download = fileName;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      // Show instructions based on device
      const isAndroid = /android/i.test(navigator.userAgent);
      const isMobile = /mobile|tablet/i.test(navigator.userAgent);
      
      if (isAndroid || isMobile) {
        alert('Label PDF downloaded. Please open with a PDF viewer that supports printing to your thermal printer.');
      } else {
        // Desktop - inform that PDF will auto-print when opened
        console.log('Label PDF downloaded with auto-print enabled. The print dialog will appear when you open the PDF.');
      }
      
      return true;
    },
    
    // Generate and print customer cards (from admin dashboard)
    generateAndPrintCustomerCards: async function(customers) {
      // This is extracted from administrator-dashboard-init.js
      // Check if jsPDF is available
      if (typeof window.jspdf === 'undefined') {
        console.error('jsPDF library not loaded');
        throw new Error('PDF generation library not loaded. Please refresh the page and try again.');
      }
      
      // Create new PDF with 4x6 inch dimensions
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: [4, 6]
      });
      
      let isFirstCard = true;
      
      for (const customer of customers) {
        // Add new page for each card except the first
        if (!isFirstCard) {
          pdf.addPage();
        }
        isFirstCard = false;
        
        // Set margins and positions
        const margin = 0.375;
        const pageWidth = 4;
        const pageHeight = 6;
        const contentWidth = pageWidth - (margin * 2);
        
        // Add header
        pdf.setFontSize(24);
        pdf.setFont('helvetica', 'bold');
        pdf.text((window.BRAND && window.BRAND.name) || 'Laundromat', pageWidth / 2, margin + 0.5, { align: 'center' });
        
        // Add customer name
        pdf.setFontSize(18);
        pdf.setFont('helvetica', 'normal');
        const customerName = `${customer.firstName} ${customer.lastName}`;
        pdf.text(customerName, pageWidth / 2, margin + 1, { align: 'center' });

        // Store address below the customer name
        drawStoreAddress(pdf, pageWidth, margin + 1.25);

        // Generate QR code using the same method as admin dashboard
        let qrImageUrl;
        try {
          qrImageUrl = await QRCode.toDataURL(customer.customerId, {
            width: 256,
            margin: 1,
            errorCorrectionLevel: 'H',
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });
        } catch (qrError) {
          console.error('QR Code generation error:', qrError);
          // Create a fallback placeholder if QR code fails
          const canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 256;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#000';
          ctx.font = '20px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(customer.customerId, 128, 128);
          qrImageUrl = canvas.toDataURL('image/png');
        }
        
        // Add QR code to PDF (centered; nudged down to clear the address block)
        const qrSizeInInches = 2.5;
        const qrX = (pageWidth - qrSizeInInches) / 2;
        pdf.addImage(qrImageUrl, 'PNG', qrX, 1.95, qrSizeInInches, qrSizeInInches);
        
        // Add customer ID
        pdf.setFontSize(14);
        pdf.setFont('courier', 'bold');
        pdf.text(`ID: ${customer.customerId}`, pageWidth / 2, 4.5, { align: 'center' });
        
        // Add customer details
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        
        let yPos = 5;
        const lineHeight = 0.2;
        
        // Phone
        if (customer.phone) {
          pdf.text(`Phone: ${customer.phone}`, pageWidth / 2, yPos, { align: 'center' });
          yPos += lineHeight;
        }
        
        // Number of bags
        if (customer.numberOfBags) {
          pdf.text(`Bags: ${customer.numberOfBags}`, pageWidth / 2, yPos, { align: 'center' });
          yPos += lineHeight;
        }
        
        // Service frequency
        if (customer.serviceFrequency) {
          const frequency = customer.serviceFrequency.charAt(0).toUpperCase() + customer.serviceFrequency.slice(1);
          pdf.text(`Service: ${frequency}`, pageWidth / 2, yPos, { align: 'center' });
          yPos += lineHeight;
        }
        
        // Add footer
        pdf.setFontSize(8);
        pdf.text('Scan this card at pickup', pageWidth / 2, pageHeight - margin - 0.2, { align: 'center' });
        
        // Registration date
        const regDate = new Date(customer.registrationDate).toLocaleDateString();
        pdf.text(`Member since: ${regDate}`, pageWidth / 2, pageHeight - margin, { align: 'center' });
      }
      
      // Add auto-print JavaScript to the PDF
      // This will trigger print dialog when PDF is opened
      pdf.autoPrint();
      
      // Download the PDF with auto-print enabled
      const pdfBlob = pdf.output('blob');
      const fileName = `bag-labels-${new Date().getTime()}.pdf`;
      
      // Create download link
      const downloadLink = document.createElement('a');
      downloadLink.href = URL.createObjectURL(pdfBlob);
      downloadLink.download = fileName;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      // Show instructions based on device
      const isAndroid = /android/i.test(navigator.userAgent);
      const isMobile = /mobile|tablet/i.test(navigator.userAgent);
      
      if (isAndroid || isMobile) {
        alert('Label PDF downloaded. Please open with a PDF viewer that supports printing to your thermal printer.');
      } else {
        // Desktop - inform that PDF will auto-print when opened
        console.log('Label PDF downloaded with auto-print enabled. The print dialog will appear when you open the PDF.');
      }
      
      return true;
    }
  };
  
  console.log('label-print-utils.js loaded successfully, LabelPrintUtils available:', !!window.LabelPrintUtils);
})();