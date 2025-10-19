/**
 * Cognitive Timeline Visualization Component using D3.js
 * Shows temporal evolution of cognitive dimensions
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { CognitiveMetrics, TemporalMetrics, CognitiveDimension } from '../types/cognitive';

interface CognitiveTimelineProps {
  metrics: CognitiveMetrics;
  currentTime: number;
  onTimeChange: (time: number) => void;
  width: number;
  height: number;
}

export default function CognitiveTimeline({
  metrics,
  currentTime,
  onTimeChange,
  width,
  height,
}: CognitiveTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions] = useState({
    margin: { top: 20, right: 30, bottom: 40, left: 50 },
    width: width - 80,
    height: height - 60,
  });

  const dimensionColors = {
    [CognitiveDimension.FACTUAL_RETRIEVAL]: '#4CAF50',
    [CognitiveDimension.LOGICAL_INFERENCE]: '#2196F3',
    [CognitiveDimension.CREATIVE_SYNTHESIS]: '#FF9800',
    [CognitiveDimension.META_COGNITION]: '#9C27B0',
  };

  // Create scales
  const scales = useMemo(() => {
    const xScale = d3.scaleTime()
      .domain([
        d3.min(metrics.temporalEvolution, d => d.timestamp) || new Date(),
        d3.max(metrics.temporalEvolution, d => d.timestamp) || new Date(),
      ])
      .range([0, dimensions.width]);

    const yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([dimensions.height, 0]);

    return { xScale, yScale };
  }, [metrics.temporalEvolution, dimensions]);

  // Create line generators
  const lineGenerators = useMemo(() => {
    return Object.values(CognitiveDimension).reduce((acc, dimension) => {
      acc[dimension] = d3.line<TemporalMetrics>()
        .x(d => scales.xScale(d.timestamp))
        .y(d => scales.yScale(d.dimensionActivity[dimension]))
        .curve(d3.curveMonotoneX);
      return acc;
    }, {} as Record<CognitiveDimension, d3.Line<TemporalMetrics>>);
  }, [scales]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Create main group
    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${dimensions.margin.left},${dimensions.margin.top})`);

    // Create gradient definitions
    const defs = svg.append('defs');

    Object.entries(dimensionColors).forEach(([dimension, color]) => {
      const gradient = defs.append('linearGradient')
        .attr('id', `gradient-${dimension}`)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');

      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', color)
        .attr('stop-opacity', 0.6);

      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', color)
        .attr('stop-opacity', 0.1);
    });

    // Add grid lines
    const gridGroup = g.append('g').attr('class', 'grid');

    // Horizontal grid lines
    gridGroup.selectAll('.horizontal-grid')
      .data(scales.yScale.ticks(5))
      .enter()
      .append('line')
      .attr('class', 'horizontal-grid')
      .attr('x1', 0)
      .attr('x2', dimensions.width)
      .attr('y1', d => scales.yScale(d))
      .attr('y2', d => scales.yScale(d))
      .attr('stroke', '#333333')
      .attr('stroke-width', 0.5)
      .attr('stroke-dasharray', '2,2');

    // Vertical grid lines
    gridGroup.selectAll('.vertical-grid')
      .data(scales.xScale.ticks(10))
      .enter()
      .append('line')
      .attr('class', 'vertical-grid')
      .attr('x1', d => scales.xScale(d))
      .attr('x2', d => scales.xScale(d))
      .attr('y1', 0)
      .attr('y2', dimensions.height)
      .attr('stroke', '#333333')
      .attr('stroke-width', 0.5)
      .attr('stroke-dasharray', '2,2');

    // Create area generators for filled areas under lines
    const areaGenerators = Object.values(CognitiveDimension).reduce((acc, dimension) => {
      acc[dimension] = d3.area<TemporalMetrics>()
        .x(d => scales.xScale(d.timestamp))
        .y0(dimensions.height)
        .y1(d => scales.yScale(d.dimensionActivity[dimension]))
        .curve(d3.curveMonotoneX);
      return acc;
    }, {} as Record<CognitiveDimension, d3.Area<TemporalMetrics>>);

    // Draw areas
    Object.values(CognitiveDimension).forEach(dimension => {
      g.append('path')
        .datum(metrics.temporalEvolution)
        .attr('fill', `url(#gradient-${dimension})`)
        .attr('d', areaGenerators[dimension] || '')
        .attr('opacity', 0.7);
    });

    // Draw lines
    Object.values(CognitiveDimension).forEach(dimension => {
      const path = g.append('path')
        .datum(metrics.temporalEvolution)
        .attr('fill', 'none')
        .attr('stroke', dimensionColors[dimension])
        .attr('stroke-width', 2)
        .attr('d', lineGenerators[dimension] || '');

      // Animate line drawing
      const totalLength = path.node()?.getTotalLength() || 0;
      path
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(2000)
        .ease(d3.easeLinear)
        .attr('stroke-dashoffset', 0);
    });

    // Add interactive overlay
    const overlay = g.append('rect')
      .attr('class', 'overlay')
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)
      .attr('fill', 'none')
      .attr('pointer-events', 'all');

    // Add tooltip and crosshair
    const tooltipGroup = g.append('g').attr('class', 'tooltip').style('display', 'none');

    // Vertical line for current time
    tooltipGroup.append('line')
      .attr('class', 'crosshair')
      .attr('x1', 0)
      .attr('x2', 0)
      .attr('y1', 0)
      .attr('y2', dimensions.height)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,2');

    // Tooltip background
    const tooltipBg = tooltipGroup.append('rect')
      .attr('class', 'tooltip-bg')
      .attr('x', 10)
      .attr('y', 10)
      .attr('width', 150)
      .attr('height', 80)
      .attr('fill', 'rgba(0, 0, 0, 0.8)')
      .attr('rx', 4)
      .attr('stroke', '#666666')
      .attr('stroke-width', 1);

    // Tooltip text
    const tooltipText = tooltipGroup.append('text')
      .attr('class', 'tooltip-text')
      .attr('x', 20)
      .attr('y', 30)
      .attr('fill', 'white')
      .attr('font-size', '12px')
      .attr('font-family', 'Arial, sans-serif');

    // Mouse interaction
    overlay.on('mousemove', (event) => {
      const [mouseX] = d3.pointer(event);
      const time = scales.xScale.invert(mouseX);

      // Update crosshair position
      tooltipGroup.select('.crosshair').attr('x1', mouseX).attr('x2', mouseX);

      // Find closest data point
      const bisect = d3.bisector((d: TemporalMetrics) => d.timestamp.getTime()).left;
      const index = bisect(metrics.temporalEvolution, time.getTime());
      const data = metrics.temporalEvolution[Math.max(0, Math.min(index - 1, metrics.temporalEvolution.length - 1))];

      if (data) {
        // Update tooltip content
        let tooltipContent = `Time: ${data.timestamp.toLocaleTimeString()}\n`;
        tooltipContent += `Cognitive Load: ${(data.cognitiveLoad * 100).toFixed(1)}%\n`;
        tooltipContent += `Complexity: ${(data.complexityScore * 100).toFixed(1)}%\n\n`;

        Object.entries(data.dimensionActivity).forEach(([dimension, value]) => {
          tooltipContent += `${dimension.replace('_', ' ')}: ${(value * 100).toFixed(1)}%\n`;
        });

        tooltipText.text(tooltipContent);

        // Position tooltip
        const tooltipX = mouseX + 10;
        const tooltipY = 10;
        tooltipGroup.attr('transform', `translate(${tooltipX}, ${tooltipY})`);

        tooltipGroup.style('display', 'block');

        // Update current time
        onTimeChange(data.timestamp.getTime());
      }
    });

    overlay.on('mouseout', () => {
      tooltipGroup.style('display', 'none');
    });

    // X axis
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${dimensions.height})`)
      .call(d3.axisBottom(scales.xScale)
        .tickFormat((d: any) => d3.timeFormat('%H:%M:%S')(d))
        .ticks(10))
      .selectAll('text')
      .style('fill', '#cccccc')
      .style('font-size', '11px');

    // Y axis
    g.append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(scales.yScale)
        .tickFormat(d3.format('.0%'))
        .ticks(5))
      .selectAll('text')
      .style('fill', '#cccccc')
      .style('font-size', '11px');

    // Axis labels
    g.append('text')
      .attr('class', 'x-label')
      .attr('x', dimensions.width / 2)
      .attr('y', dimensions.height + 35)
      .attr('text-anchor', 'middle')
      .style('fill', '#cccccc')
      .style('font-size', '13px')
      .text('Time');

    g.append('text')
      .attr('class', 'y-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -dimensions.height / 2)
      .attr('y', -35)
      .attr('text-anchor', 'middle')
      .style('fill', '#cccccc')
      .style('font-size', '13px')
      .text('Cognitive Activity');

    // Legend
    const legend = g.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${dimensions.width - 150}, 10)`);

    Object.entries(dimensionColors).forEach(([dimension, color], index) => {
      const legendRow = legend.append('g')
        .attr('transform', `translate(0, ${index * 20})`);

      legendRow.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', color)
        .attr('rx', 2);

      legendRow.append('text')
        .attr('x', 18)
        .attr('y', 10)
        .attr('fill', '#cccccc')
        .attr('font-size', '11px')
        .attr('alignment-baseline', 'middle')
        .text(dimension.replace('_', ' ').toUpperCase());
    });

    // Current time indicator
    if (currentTime > 0) {
      const currentTimeIndicator = g.append('line')
        .attr('class', 'current-time-indicator')
        .attr('x1', scales.xScale(new Date(currentTime)))
        .attr('x2', scales.xScale(new Date(currentTime)))
        .attr('y1', 0)
        .attr('y2', dimensions.height)
        .attr('stroke', '#ff6b6b')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,4');

      // Animate current time indicator
      currentTimeIndicator
        .attr('opacity', 0)
        .transition()
        .duration(500)
        .attr('opacity', 1);
    }

  }, [metrics, scales, lineGenerators, dimensions, width, height, currentTime, onTimeChange]);

  return (
    <div className="cognitive-timeline" style={{ width, height }}>
      <svg ref={svgRef} />
    </div>
  );
}