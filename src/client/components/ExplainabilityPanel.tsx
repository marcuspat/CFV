import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Slider } from '../components/ui/slider';
import { Switch } from '../components/ui/switch';
import {
  Info,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  Zap,
  Target,
  Brain,
  HelpCircle
} from 'lucide-react';

// Types
interface FeatureImportance {
  [featureName: string]: number;
}

interface Rule {
  rule_id: string;
  description: string;
  confidence: number;
  applicable_features: string[];
  reasoning_type: string;
}

interface UncertaintyBounds {
  [featureName: string]: [number, number];
}

interface ExplanationResult {
  explanation_id: string;
  explanation_type: string;
  confidence_score: number;
  feature_importance: FeatureImportance;
  rules: Rule[];
  uncertainty_bounds: UncertaintyBounds;
  timestamp: string;
  user_feedback?: UserFeedback;
  validation_score?: number;
}

interface UserFeedback {
  understanding: number;
  trust: number;
  usefulness: number;
  accuracy: number;
  comments?: string;
}

interface CognitiveElement {
  element_id: string;
  element_type: string;
  prediction: number;
  confidence: number;
  explanation?: ExplanationResult;
}

interface ExplainabilityPanelProps {
  cognitiveElement: CognitiveElement;
  onFeedbackSubmit?: (feedback: UserFeedback) => void;
  onExportExplanation?: (format: 'json' | 'text' | 'detailed') => void;
  onQuerySubmit?: (query: string) => Promise<QueryResponse>;
  className?: string;
}

interface QueryResponse {
  explanation_id: string;
  query: string;
  response: string;
  followup_questions: string[];
  confidence: number;
  timestamp: string;
}

const ExplainabilityPanel: React.FC<ExplainabilityPanelProps> = ({
  cognitiveElement,
  onFeedbackSubmit,
  onExportExplanation,
  onQuerySubmit,
  className = ""
}) => {
  // State management
  const [activeTab, setActiveTab] = useState('overview');
  const [showUncertainty, setShowUncertainty] = useState(false);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [confidenceThreshold, setConfidenceThreshold] = useState([0.7]);
  const [userFeedback, setUserFeedback] = useState<UserFeedback>({
    understanding: 3,
    trust: 3,
    usefulness: 3,
    accuracy: 3,
    comments: ''
  });
  const [interactiveQuery, setInteractiveQuery] = useState('');
  const [queryHistory, setQueryHistory] = useState<QueryResponse[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [explanationDetails, setExplanationDetails] = useState<ExplanationResult | null>(null);

  // Memoized calculations
  const topFeatures = useMemo(() => {
    if (!cognitiveElement.explanation?.feature_importance) return [];

    return Object.entries(cognitiveElement.explanation.feature_importance)
      .sort(([,a], [,b]) => Math.abs(b) - Math.abs(a))
      .slice(0, 10);
  }, [cognitiveElement.explanation]);

  const highConfidenceRules = useMemo(() => {
    if (!cognitiveElement.explanation?.rules) return [];

    return cognitiveElement.explanation.rules
      .filter(rule => rule.confidence >= confidenceThreshold[0])
      .sort((a, b) => b.confidence - a.confidence);
  }, [cognitiveElement.explanation, confidenceThreshold]);

  const validationScore = useMemo(() => {
    return cognitiveElement.explanation?.validation_score ||
           cognitiveElement.explanation?.confidence_score || 0;
  }, [cognitiveElement.explanation]);

  // Effects
  useEffect(() => {
    if (cognitiveElement.explanation) {
      setExplanationDetails(cognitiveElement.explanation);
    }
  }, [cognitiveElement.explanation]);

  // Feature importance visualization
  const renderFeatureImportanceChart = useCallback(() => {
    if (!topFeatures.length) return null;

    const width = 600;
    const height = 400;
    const margin = { top: 20, right: 30, bottom: 100, left: 60 };

    const svgRef = React.useRef<SVGSVGElement>(null);

    useEffect(() => {
      if (!svgRef.current) return;

      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      const x = d3.scaleBand()
        .range([0, width - margin.left - margin.right])
        .domain(topFeatures.map(d => d[0]))
        .padding(0.1);

      const y = d3.scaleLinear()
        .range([height - margin.top - margin.bottom, 0])
        .domain([-1, 1]);

      const colorScale = d3.scaleSequential(d3.interpolateRdBu)
        .domain([-1, 1]);

      const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      // Add bars
      g.selectAll(".bar")
        .data(topFeatures)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d[0])!)
        .attr("width", x.bandwidth())
        .attr("y", d => y(Math.max(0, d[1])))
        .attr("height", d => Math.abs(y(d[1]) - y(0)))
        .attr("fill", d => colorScale(d[1]))
        .attr("rx", 4);

      // Add x-axis
      g.append("g")
        .attr("transform", `translate(0,${height - margin.top - margin.bottom})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");

      // Add y-axis
      g.append("g")
        .call(d3.axisLeft(y));

      // Add zero line
      g.append("line")
        .attr("x1", 0)
        .attr("x2", width - margin.left - margin.right)
        .attr("y1", y(0))
        .attr("y2", y(0))
        .attr("stroke", "#666")
        .attr("stroke-dasharray", "2,2");

    }, [topFeatures]);

    return (
      <div className="w-full overflow-x-auto">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="border rounded-lg bg-white"
        />
      </div>
    );
  }, [topFeatures]);

  // Confidence visualization
  const renderConfidenceVisualization = useCallback(() => {
    const confidence = validationScore;
    const targetConfidence = 0.95;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Overall Confidence</span>
          <Badge variant={confidence >= targetConfidence ? "default" : "secondary"}>
            {(confidence * 100).toFixed(1)}%
          </Badge>
        </div>

        <Progress value={confidence * 100} className="h-3" />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Current: {(confidence * 100).toFixed(1)}%</span>
          <span>Target: {(targetConfidence * 100).toFixed(1)}%</span>
        </div>

        {confidence >= targetConfidence ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">Meets validation target</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Below validation target</span>
          </div>
        )}
      </div>
    );
  }, [validationScore]);

  // Interactive query handler
  const handleQuerySubmit = async () => {
    if (!interactiveQuery.trim() || !onQuerySubmit) return;

    setIsSubmitting(true);
    try {
      const response = await onQuerySubmit(interactiveQuery);
      setQueryHistory(prev => [response, ...prev].slice(0, 5)); // Keep last 5 queries
      setInteractiveQuery('');
    } catch (error) {
      console.error('Error submitting query:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Feedback submission handler
  const handleFeedbackSubmit = () => {
    if (!onFeedbackSubmit) return;

    onFeedbackSubmit(userFeedback);

    // Show success indication
    setTimeout(() => {
      setUserFeedback({
        understanding: 3,
        trust: 3,
        usefulness: 3,
        accuracy: 3,
        comments: ''
      });
    }, 1000);
  };

  // Export handler
  const handleExport = (format: 'json' | 'text' | 'detailed') => {
    if (onExportExplanation) {
      onExportExplanation(format);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Explainability Panel
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {cognitiveElement.element_type}
              </Badge>
              <Badge variant="outline">
                ID: {cognitiveElement.element_id}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {renderConfidenceVisualization()}
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <Eye className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center gap-1">
            <Target className="w-4 h-4" />
            Features
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-1">
            <Zap className="w-4 h-4" />
            Rules
          </TabsTrigger>
          <TabsTrigger value="interactive" className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4" />
            Interactive
          </TabsTrigger>
          <TabsTrigger value="feedback" className="flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            Feedback
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Prediction</span>
                  <span className="font-medium">{cognitiveElement.prediction.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Confidence</span>
                  <span className="font-medium">{(cognitiveElement.confidence * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Validation Score</span>
                  <span className="font-medium">{(validationScore * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Top Features</span>
                  <span className="font-medium">{topFeatures.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Applied Rules</span>
                  <span className="font-medium">{cognitiveElement.explanation?.rules?.length || 0}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Show Uncertainty Bounds</span>
                  <Switch
                    checked={showUncertainty}
                    onCheckedChange={setShowUncertainty}
                  />
                </div>
                <div className="space-y-2">
                  <span className="text-sm">Confidence Threshold</span>
                  <Slider
                    value={confidenceThreshold}
                    onValueChange={setConfidenceThreshold}
                    max={1}
                    min={0}
                    step={0.05}
                    className="w-full"
                  />
                  <span className="text-xs text-muted-foreground">
                    {(confidenceThreshold[0] * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport('json')}
                    className="flex-1"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Export
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.reload()}
                    className="flex-1"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Feature Importance Chart */}
          {topFeatures.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Feature Importance</CardTitle>
              </CardHeader>
              <CardContent>
                {renderFeatureImportanceChart()}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Features Tab */}
        <TabsContent value="features" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Feature Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              {topFeatures.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid gap-4">
                    {topFeatures.map(([feature, importance], index) => (
                      <div key={feature} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge variant={importance > 0 ? "default" : "secondary"}>
                            {index + 1}
                          </Badge>
                          <span className="font-medium">{feature}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className={`font-medium ${importance > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {importance > 0 ? '+' : ''}{importance.toFixed(3)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {importance > 0 ? 'Increases' : 'Decreases'} prediction
                            </div>
                          </div>
                          {showUncertainty && cognitiveElement.explanation?.uncertainty_bounds?.[feature] && (
                            <div className="text-xs text-muted-foreground">
                              [{cognitiveElement.explanation.uncertainty_bounds[feature][0].toFixed(3)},
                               {cognitiveElement.explanation.uncertainty_bounds[feature][1].toFixed(3)}]
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No feature importance data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Applied Rules</CardTitle>
            </CardHeader>
            <CardContent>
              {highConfidenceRules.length > 0 ? (
                <div className="space-y-4">
                  {highConfidenceRules.map((rule) => (
                    <div key={rule.rule_id} className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{rule.reasoning_type}</Badge>
                        <Badge variant={rule.confidence >= 0.9 ? "default" : "secondary"}>
                          {(rule.confidence * 100).toFixed(1)}% confidence
                        </Badge>
                      </div>
                      <p className="text-sm">{rule.description}</p>
                      {rule.applicable_features.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {rule.applicable_features.map((feature) => (
                            <Badge key={feature} variant="outline" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No high-confidence rules found with current threshold
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Interactive Tab */}
        <TabsContent value="interactive" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Interactive Query</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Ask a question about this cognitive element..."
                  value={interactiveQuery}
                  onChange={(e) => setInteractiveQuery(e.target.value)}
                  className="flex-1"
                  rows={3}
                />
              </div>
              <Button
                onClick={handleQuerySubmit}
                disabled={!interactiveQuery.trim() || isSubmitting || !onQuerySubmit}
                className="w-full"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
                Submit Query
              </Button>

              {/* Query History */}
              {queryHistory.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium">Recent Queries</h4>
                  {queryHistory.map((query, index) => (
                    <div key={query.explanation_id} className="p-3 bg-muted rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">Q: {query.query}</span>
                        <Badge variant="outline" className="text-xs">
                          {(query.confidence * 100).toFixed(1)}%
                        </Badge>
                      </div>
                      <p className="text-sm">{query.response}</p>
                      {query.followup_questions.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Follow-up: {query.followup_questions.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feedback Tab */}
        <TabsContent value="feedback" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Provide Feedback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Understanding</label>
                  <Select value={userFeedback.understanding.toString()} onValueChange={(value) => setUserFeedback(prev => ({...prev, understanding: parseInt(value)}))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - Very Confusing</SelectItem>
                      <SelectItem value="2">2 - Confusing</SelectItem>
                      <SelectItem value="3">3 - Neutral</SelectItem>
                      <SelectItem value="4">4 - Clear</SelectItem>
                      <SelectItem value="5">5 - Very Clear</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Trust</label>
                  <Select value={userFeedback.trust.toString()} onValueChange={(value) => setUserFeedback(prev => ({...prev, trust: parseInt(value)}))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - No Trust</SelectItem>
                      <SelectItem value="2">2 - Low Trust</SelectItem>
                      <SelectItem value="3">3 - Neutral</SelectItem>
                      <SelectItem value="4">4 - High Trust</SelectItem>
                      <SelectItem value="5">5 - Complete Trust</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Usefulness</label>
                  <Select value={userFeedback.usefulness.toString()} onValueChange={(value) => setUserFeedback(prev => ({...prev, usefulness: parseInt(value)}))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - Not Useful</SelectItem>
                      <SelectItem value="2">2 - Slightly Useful</SelectItem>
                      <SelectItem value="3">3 - Moderately Useful</SelectItem>
                      <SelectItem value="4">4 - Very Useful</SelectItem>
                      <SelectItem value="5">5 - Extremely Useful</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Accuracy</label>
                  <Select value={userFeedback.accuracy.toString()} onValueChange={(value) => setUserFeedback(prev => ({...prev, accuracy: parseInt(value)}))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - Very Inaccurate</SelectItem>
                      <SelectItem value="2">2 - Inaccurate</SelectItem>
                      <SelectItem value="3">3 - Neutral</SelectItem>
                      <SelectItem value="4">4 - Accurate</SelectItem>
                      <SelectItem value="5">5 - Very Accurate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Additional Comments</label>
                <Textarea
                  placeholder="Share any additional feedback or suggestions..."
                  value={userFeedback.comments}
                  onChange={(e) => setUserFeedback(prev => ({...prev, comments: e.target.value}))}
                  rows={3}
                />
              </div>

              <Button onClick={handleFeedbackSubmit} disabled={!onFeedbackSubmit} className="w-full">
                <TrendingUp className="w-4 h-4 mr-2" />
                Submit Feedback
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ExplainabilityPanel;